import type { H3Event } from 'h3'
import type { SessionUser } from './supabase'

/** Filter reservasi bersama untuk daftar & ekspor (RLS tetap berlaku di DB). */
export function reservationQuery(event: H3Event, user: SessionUser, columns: string, count = false) {
  const query = getQuery(event)
  let request = user.db.from('reservation_report').select(columns, count ? { count: 'exact' } : undefined)
  const invitation = optionalUuid(query.invitation)
  if (invitation) request = request.eq('invitation_id', invitation)
  const gift = optionalUuid(query.gift)
  if (gift) request = request.eq('gift_id', gift)
  if (query.status === 'confirmed' || query.status === 'cancelled') request = request.eq('status', query.status)
  const pattern = searchPattern(query.q)
  if (pattern) request = request.ilike('search_text', pattern)
  return request.order('created_at', { ascending: false }).order('id', { ascending: false })
}
