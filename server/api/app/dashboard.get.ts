// Statistik dashboard (satu panggilan database). RLS membatasi pelanggan ke datanya sendiri;
// bagian admin (order, website, audit) hanya dikembalikan untuk admin platform.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const days = Number(getQuery(event).days)
  const { data, error } = await user.db.rpc('dashboard_stats', { p_days: [7, 14, 30, 90].includes(days) ? days : 7 })
  if (error) throw dbError(error)
  // Gambar http:// hadiah terpopuler dilewatkan proksi bertanda tangan.
  const stats = (data ?? {}) as { top_gifts?: Array<{ image_url?: string | null }> }
  if (Array.isArray(stats.top_gifts)) stats.top_gifts = proxyImages(stats.top_gifts)
  return stats
})
