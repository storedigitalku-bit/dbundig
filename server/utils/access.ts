import type { SessionUser } from './supabase'

/** Daftar invitation_id dari body (unik, UUID valid, maks. 500). */
export function invitationIdsParam(value: unknown): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw badRequest('invitation_ids harus berupa daftar.')
  const ids = [...new Set(value.map((v) => uuidParam(v, 'invitation_ids')))]
  if (ids.length > 500) throw badRequest('Maksimal 500 undangan sekaligus.')
  return ids
}

export const ONE_INVITATION_MESSAGE = 'Satu akun pelanggan hanya dapat mengakses satu undangan.'
export const ONE_ACCOUNT_MESSAGE = 'Satu undangan hanya untuk satu akun pelanggan.'

const holderName = (p: { username?: string | null; display_name?: string | null } | null) => p?.username || p?.display_name || 'akun lain'

/**
 * Akun lain yang sudah memegang undangan ini (akses eksplisit atau pemetaan otomatis pemiliknya), atau null.
 * Dipakai agar akses tetap 1:1: satu undangan hanya untuk satu akun pelanggan.
 */
export async function invitationHolder(admin: SessionUser, invitationId: string, exceptUserId: string): Promise<{ name: string; title: string } | null> {
  const inv = await admin.db.from('invitations').select('title, website_id, owner_external_id').eq('id', invitationId).maybeSingle()
  if (inv.error) throw dbError(inv.error)
  if (!inv.data) return null
  const title = (inv.data.title as string) || 'Tanpa judul'
  const acc = await admin.db.from('invitation_access').select('user_id, profiles!invitation_access_user_id_fkey(username, display_name)').eq('invitation_id', invitationId).neq('user_id', exceptUserId).limit(1).maybeSingle()
  if (acc.error) throw dbError(acc.error)
  if (acc.data) return { name: holderName(acc.data.profiles as { username?: string; display_name?: string } | null), title }
  if (inv.data.owner_external_id) {
    const map = await admin.db.from('owner_mappings').select('user_id, profiles!owner_mappings_user_id_fkey(username, display_name)')
      .eq('website_id', inv.data.website_id as string).eq('external_owner_id', inv.data.owner_external_id as string).neq('user_id', exceptUserId).limit(1).maybeSingle()
    if (map.error) throw dbError(map.error)
    if (map.data) return { name: holderName(map.data.profiles as { username?: string; display_name?: string } | null), title }
  }
  return null
}

export function invitationTaken(h: { name: string; title: string }) {
  return createError({ statusCode: 409, statusMessage: 'invitation_taken', data: { message: `Undangan "${h.title}" sudah dipakai akun ${h.name}. ${ONE_ACCOUNT_MESSAGE} Cabut dulu aksesnya untuk mengganti.` } })
}

/** Akses yang sudah dimiliki akun (undangan eksplisit atau pemetaan otomatis), untuk pesan yang jelas. */
export async function existingAccess(admin: SessionUser, userId: string): Promise<{ invitationId: string | null; title: string | null; mapped: boolean }> {
  const [acc, map] = await Promise.all([
    admin.db.from('invitation_access').select('invitation_id, invitations(title)').eq('user_id', userId).maybeSingle(),
    admin.db.from('owner_mappings').select('id').eq('user_id', userId).maybeSingle(),
  ])
  if (acc.error) throw dbError(acc.error)
  if (map.error) throw dbError(map.error)
  const title = (acc.data?.invitations as { title?: string } | null)?.title
  return { invitationId: (acc.data?.invitation_id as string | undefined) ?? null, title: acc.data ? (title || 'Tanpa judul') : null, mapped: !!map.data }
}

/**
 * Menyamakan akses eksplisit satu akun pelanggan dengan `ids` (maksimal satu undangan): akses lama dicabut dulu,
 * lalu undangan baru diberikan. Berjalan dengan klien JWT admin, jadi RLS invitation_access (khusus admin) tetap berlaku.
 */
export async function syncUserAccess(admin: SessionUser, userId: string, ids: string[]) {
  if (ids.length > 1) throw badRequest(ONE_INVITATION_MESSAGE + ' Pilih salah satu.')
  const current = await admin.db.from('invitation_access').select('invitation_id').eq('user_id', userId)
  if (current.error) throw dbError(current.error)
  const have = new Set((current.data ?? []).map((r) => r.invitation_id as string))
  const want = new Set(ids)
  const add = ids.filter((id) => !have.has(id))
  const remove = [...have].filter((id) => !want.has(id))
  if (add.length) {
    const found = await admin.db.from('invitations').select('id').in('id', add)
    if (found.error) throw dbError(found.error)
    if ((found.data ?? []).length !== add.length) throw badRequest('Undangan tidak ditemukan. Muat ulang halaman lalu coba lagi.')
    const mapped = await admin.db.from('owner_mappings').select('id').eq('user_id', userId).maybeSingle()
    if (mapped.error) throw dbError(mapped.error)
    if (mapped.data) throw createError({ statusCode: 409, statusMessage: 'user_has_access', data: { message: 'Akun ini sudah mendapat undangan lewat pemetaan otomatis (menu Koneksi). ' + ONE_INVITATION_MESSAGE } })
    for (const id of add) {
      const holder = await invitationHolder(admin, id, userId)
      if (holder) throw invitationTaken(holder)
    }
  }
  // Cabut dulu, baru beri: satu akun hanya boleh memegang satu baris akses.
  if (remove.length) {
    const { error } = await admin.db.from('invitation_access').delete().eq('user_id', userId).in('invitation_id', remove)
    if (error) throw dbError(error)
  }
  if (add.length) {
    const { error } = await admin.db.from('invitation_access')
      .insert(add.map((invitation_id) => ({ invitation_id, user_id: userId, granted_by: admin.id })))
    if (error) throw dbError(error)
  }
  for (const id of add) await audit(admin, 'access.grant', id, { user_id: userId })
  for (const id of remove) await audit(admin, 'access.revoke', id, { user_id: userId })
  return { granted: add.length, revoked: remove.length, total: ids.length }
}
