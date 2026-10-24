import { isInternalEmail } from '../../lib/accounts'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { data, error } = await user.db.from('profiles').select('id, username, email, display_name, created_at').eq('id', user.id).maybeSingle()
  if (error) throw dbError(error)
  const email = data?.email || user.email
  return {
    id: user.id,
    username: data?.username ?? null,
    email: isInternalEmail(email) ? '' : email,
    display_name: data?.display_name ?? '',
    role: user.isAdmin ? 'admin' : 'customer',
    created_at: data?.created_at ?? null,
  }
})
