// owner_id yang benar-benar dikirim WordPress (filter apeiron_daftar_hadiah_owner_id), per website.
// Dipakai sebagai pilihan pemetaan — admin tidak mengetik ID secara manual.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const website = uuidParam(getQuery(event).website, 'website')
  const { data, error } = await user.db.from('invitations')
    .select('owner_external_id, title').eq('website_id', website).not('owner_external_id', 'is', null).limit(5000)
  if (error) throw dbError(error)
  const byOwner = new Map<string, { owner_id: string; invitations: number; example_title: string }>()
  for (const row of data ?? []) {
    const id = row.owner_external_id as string
    const item = byOwner.get(id) ?? { owner_id: id, invitations: 0, example_title: row.title }
    item.invitations++
    byOwner.set(id, item)
  }
  return { items: [...byOwner.values()].sort((a, b) => a.owner_id.localeCompare(b.owner_id)) }
})
