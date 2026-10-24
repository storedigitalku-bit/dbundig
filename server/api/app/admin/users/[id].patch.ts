import { internalEmail, isInternalEmail, normalizeEmail, normalizeUsername } from '../../../../lib/accounts'
import { normalizeWhatsapp } from '../../../../../shared/whatsapp'

// Ubah akun (admin): nama, username, email, peran. Password lewat endpoint terpisah.
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const body = await readJson(event)
  const service = useServiceClient()
  if (!service) throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'NUXT_SUPABASE_SECRET_KEY belum diisi pada server.' } })

  const { data: current, error: readError } = await service.from('profiles').select('id, username, email, display_name').eq('id', id).maybeSingle()
  if (readError) throw dbError(readError)
  if (!current) throw notFound('Akun tidak ditemukan.')

  const profilePatch: Record<string, unknown> = {}
  if (body.display_name !== undefined) {
    if (typeof body.display_name !== 'string' || body.display_name.trim().length > 120) throw badRequest('Nama tampilan maksimal 120 karakter.')
    profilePatch.display_name = body.display_name.trim()
  }
  if (body.whatsapp !== undefined) {
    const raw = typeof body.whatsapp === 'string' ? body.whatsapp.trim() : ''
    const wa = raw ? normalizeWhatsapp(raw) : null
    if (raw && !wa) throw badRequest('Nomor WhatsApp tidak valid. Gunakan nomor aktif, mis. 0812-3456-7890 atau +62 812 3456 7890.')
    profilePatch.whatsapp = wa
  }
  let username = current.username as string | null
  if (body.username !== undefined) {
    const next = normalizeUsername(body.username)
    if (!next) throw badRequest('Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.')
    if (next !== current.username) {
      const taken = await service.from('profiles').select('id').eq('username', next).neq('id', id).maybeSingle()
      if (taken.data) throw createError({ statusCode: 409, statusMessage: 'conflict', data: { message: 'Username sudah dipakai.' } })
      profilePatch.username = next
      username = next
    }
  }
  if (body.email !== undefined) {
    const raw = typeof body.email === 'string' ? body.email.trim() : ''
    const email = raw ? normalizeEmail(raw) : (username ? internalEmail(username) : null)
    if (!email) throw badRequest('Alamat email tidak valid.')
    const sameAsInternal = !raw && isInternalEmail(current.email)
    if (email !== current.email && !sameAsInternal) {
      const { error } = await service.auth.admin.updateUserById(id, { email, email_confirm: true })
      if (error) {
        const exists = /already|registered|exists/i.test(error.message)
        throw createError({ statusCode: exists ? 409 : 502, statusMessage: 'update_failed', data: { message: exists ? 'Email sudah dipakai akun lain.' : 'Email gagal diperbarui oleh Supabase Auth.' } })
      }
    }
  }
  if (Object.keys(profilePatch).length) {
    const { error } = await service.from('profiles').update(profilePatch).eq('id', id)
    if (error) throw dbError(error)
  }

  if (body.role !== undefined) {
    if (body.role !== 'admin' && body.role !== 'customer') throw badRequest('Peran tidak valid.')
    const { data: isAdminRow } = await service.from('platform_admins').select('user_id').eq('user_id', id).maybeSingle()
    if (body.role === 'customer' && isAdminRow) {
      if (id === admin.id) throw badRequest('Anda tidak dapat menurunkan peran akun Anda sendiri.')
      const { count } = await service.from('platform_admins').select('user_id', { count: 'exact', head: true })
      if ((count ?? 0) <= 1) throw badRequest('Minimal harus ada satu admin platform.')
      const { error } = await service.from('platform_admins').delete().eq('user_id', id)
      if (error) throw dbError(error)
    }
    if (body.role === 'admin' && !isAdminRow) {
      const { error } = await service.from('platform_admins').insert({ user_id: id, note: `ditetapkan oleh ${admin.id}` })
      if (error) throw dbError(error)
    }
  }
  await audit(admin, 'user.update', id, { fields: Object.keys(body) })
  return { ok: true }
})
