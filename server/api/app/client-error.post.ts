// Laporan error dari browser (pengguna yang sudah masuk). Ukuran dibatasi; hanya pesan & lokasi singkat.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readJson(event)
  const message = typeof body.message === 'string' ? body.message : ''
  if (!message.trim()) throw badRequest('Pesan error kosong.')
  const path = typeof body.path === 'string' ? body.path : ''
  const stack = typeof body.stack === 'string' ? body.stack.slice(0, 1500) : ''
  await logError({ source: 'client', path, message, detail: { stack, ua: (getHeader(event, 'user-agent') ?? '').slice(0, 200) }, userId: user.id })
  setResponseStatus(event, 202)
  return { ok: true }
})
