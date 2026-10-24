import { randomBytes } from 'node:crypto'
import { ORDER_STATUSES, buildOrderFields } from '../../../../lib/crud'

// Tambah Order Undangan manual (admin), mis. pesanan lewat telepon/chat.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const body = await readJson(event)
  const websiteId = uuidParam(body.website_id, 'website_id')
  const built = buildOrderFields(body.entries)
  if (typeof built === 'string') throw badRequest(built)
  const status = typeof body.status === 'string' && (ORDER_STATUSES as readonly string[]).includes(body.status) ? body.status : 'baru'
  const title = typeof body.post_title === 'string' ? body.post_title.trim().slice(0, 1000) : ''
  const note = typeof body.admin_note === 'string' ? body.admin_note.trim().slice(0, 2000) : ''
  const requestId = randomBytes(32).toString('hex')
  const { data, error } = await user.db.from('form_orders').insert({
    website_id: websiteId, request_id: requestId, payload_hash: requestId, post_title: title || 'Order manual',
    fields: built.fields, labels: built.labels, status, admin_note: note, source: 'admin',
  }).select('id').single()
  if (error) throw dbError(error)
  await audit(user, 'order.create', data.id)
  setResponseStatus(event, 201)
  return { id: data.id }
})
