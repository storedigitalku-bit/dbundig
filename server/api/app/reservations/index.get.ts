export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { page, size, from, to } = pageParams(event)
  // Catatan admin & sumber hanya untuk admin platform.
  const columns = 'id, invitation_id, invitation_title, gift_id, gift_name, guest_name, guest_whatsapp, message, quantity, status, created_at'
    + (user.isAdmin ? ', source, admin_note, updated_at' : '')
  const { data, error, count } = await reservationQuery(event, user, columns, true)
    .range(from, to)
  if (error) throw dbError(error)
  return { items: data ?? [], total: count ?? 0, page, per_page: size }
})
