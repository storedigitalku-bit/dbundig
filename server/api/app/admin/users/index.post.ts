import { internalEmail, normalizeEmail, normalizeUsername, passwordProblem } from '../../../../lib/accounts'
import { normalizeWhatsapp } from '../../../../../shared/whatsapp'

// Admin membuat akun pelanggan langsung (username + password). Akun baru selalu berperan pelanggan;
// undangan yang boleh dilihat bisa langsung dipilih (invitation_ids) atau diatur belakangan.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = await readJson(event)
  const username = normalizeUsername(body.username)
  if (!username) throw badRequest('Username 3–32 karakter: huruf kecil, angka, titik, garis bawah, atau tanda hubung.')
  const problem = passwordProblem(body.password)
  if (problem) throw badRequest(problem)
  const rawEmail = typeof body.email === 'string' ? body.email.trim() : ''
  const email = rawEmail ? normalizeEmail(rawEmail) : internalEmail(username)
  if (!email) throw badRequest('Alamat email tidak valid.')
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim().slice(0, 120) : ''
  // Nomor WhatsApp aktif wajib: dipakai untuk mengirim akses akun ke pelanggan.
  if (typeof body.whatsapp !== 'string' || !body.whatsapp.trim()) throw badRequest('Nomor WhatsApp wajib diisi untuk mengirim akses akun ke pelanggan.')
  const whatsapp = normalizeWhatsapp(body.whatsapp)
  if (!whatsapp) throw badRequest('Nomor WhatsApp tidak valid. Gunakan nomor aktif, mis. 0812-3456-7890 atau +62 812 3456 7890.')
  const invitationIds = invitationIdsParam(body.invitation_ids)
  // Satu akun pelanggan = satu undangan; dicek sebelum akun dibuat.
  if (invitationIds.length > 1) throw badRequest(ONE_INVITATION_MESSAGE + ' Pilih salah satu.')
  // Akses 1:1: undangan harus ada dan belum dipegang akun lain (akun baru belum punya id → UUID kosong).
  for (const id of invitationIds) {
    const found = await user.db.from('invitations').select('id').eq('id', id).maybeSingle()
    if (found.error) throw dbError(found.error)
    if (!found.data) throw badRequest('Undangan tidak ditemukan. Muat ulang halaman lalu coba lagi.')
    const holder = await invitationHolder(user, id, '00000000-0000-0000-0000-000000000000')
    if (holder) throw invitationTaken(holder)
  }

  const service = useServiceClient()
  if (!service) {
    throw createError({ statusCode: 503, statusMessage: 'not_configured', data: { message: 'NUXT_SUPABASE_SECRET_KEY belum diisi pada server.' } })
  }
  const taken = await service.from('profiles').select('id').eq('username', username).maybeSingle()
  if (taken.data) throw createError({ statusCode: 409, statusMessage: 'conflict', data: { message: 'Username sudah dipakai.' } })

  const { data, error } = await service.auth.admin.createUser({
    email, password: body.password as string, email_confirm: true,
    user_metadata: { username, display_name: displayName },
  })
  if (error || !data.user) {
    const exists = /already|registered|exists/i.test(error?.message ?? '')
    throw createError({
      statusCode: exists ? 409 : 502, statusMessage: exists ? 'conflict' : 'create_failed',
      data: { message: exists ? 'Email sudah terdaftar.' : 'Akun gagal dibuat oleh Supabase Auth. Periksa kebijakan password/email di Supabase.' },
    })
  }
  {
    const { error: waError } = await service.from('profiles').update({ whatsapp }).eq('id', data.user.id)
    if (waError) console.error(JSON.stringify({ scope: 'user.create', step: 'whatsapp', code: waError.code ?? null }))
  }
  await audit(user, 'user.create', data.user.id, { username })
  // Akun sudah jadi; bila pemberian akses gagal, akun tetap dikembalikan dan admin diberi tahu.
  let granted = 0
  let accessFailed = false
  if (invitationIds.length) {
    try { granted = (await syncUserAccess(user, data.user.id, invitationIds)).granted } catch { accessFailed = true }
  }
  setResponseStatus(event, 201)
  return { id: data.user.id, username, email: rawEmail ? email : null, whatsapp, granted, access_failed: accessFailed }
})
