/**
 * Ambil semua halaman dari endpoint berhalaman ({ items, total }) — per 100, maksimal `maxPages` halaman.
 * Dipakai untuk pilihan dropdown (akun / undangan) agar data setelah 100 baris pertama tetap muncul.
 */
export async function fetchAllPages<T>(
  request: <R>(url: string, options?: { query?: Record<string, unknown> }) => Promise<R>,
  url: string,
  query: Record<string, unknown> = {},
  maxPages = 50,
): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; page <= maxPages; page++) {
    const res = await request<{ items: T[]; total: number }>(url, { query: { ...query, per_page: 100, page } })
    all.push(...res.items)
    if (all.length >= res.total || !res.items.length) break
  }
  return all
}
