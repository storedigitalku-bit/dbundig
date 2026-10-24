import type { Page, Route } from '@playwright/test'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
export function fakeJwt(sub: string, email: string, aal: 'aal1' | 'aal2' = 'aal1') {
  const now = Math.floor(Date.now() / 1000)
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now, aal, amr: [{ method: aal === 'aal2' ? 'totp' : 'password', timestamp: now }] })}.sig`
}
const jwtClaims = (header: string | undefined): Record<string, unknown> => {
  try { return JSON.parse(Buffer.from(String(header ?? '').replace(/^Bearer /, '').split('.')[1] ?? '', 'base64url').toString()) } catch { return {} }
}
const isoDay = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

export type Role = 'admin' | 'customer'
export const USERS = {
  admin: { id: '00000000-0000-4000-8000-000000000001', username: 'admin', email: '', display_name: 'Admin' },
  customer: { id: '00000000-0000-4000-8000-000000000002', username: 'pelanggan1', email: 'pelanggan@uji.example', display_name: 'Pelanggan Uji' },
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
const DEFAULT_ACCESS = 'Halo, *{nama}* 👋\n\n👤 *Username:* {username}\n🔑 *Password:* {password}\n\n🔗 *Masuk di sini:*\n{link_login}\n\nTerima kasih 🙏\n{pengirim}'
const DEFAULT_RECAP = 'Halo, *{nama}* 👋\n\nRekap undangan {undangan}: *{jumlah_reservasi} reservasi*.\n\n{daftar_hadiah}\n\n{link_login}\n\nTerima kasih 🙏\n{pengirim}'

export interface MockState {
  role: Role
  tokens: Array<{ id: string; label: string; token_hint: string; scopes: string[]; created_at: string; last_used_at: string | null; revoked_at: string | null }>
  apiCalls: string[]
  delayMs: number
  createdUsers: Array<{ id: string; username: string; display_name: string; email: string; whatsapp: string | null; whatsapp_sent_at?: string | null; role: 'customer'; created_at: string }>
  passwordResets: string[]
  grants: Array<{ invitation_id: string; user_id: string }>
  reservations: Array<Record<string, unknown>>
  orders: Array<Record<string, unknown>>
  mutations: string[]
  invitations: Array<Record<string, unknown>>
  extraGifts: number
  notifications: Array<{ id: string; kind: 'order' | 'reservation'; title: string; body: string; link: string; read_at: string | null; created_at: string }>
  events: Array<Record<string, unknown>>
  audit: Array<Record<string, unknown>>
  errors: Array<Record<string, unknown>>
  waTemplates: { access: string | null; recap: string | null }
  /** Faktor verifikasi dua langkah (Supabase MFA) milik akun yang login. */
  factors: Array<{ id: string; factor_type: 'totp'; status: 'verified' | 'unverified'; friendly_name: string }>
  pushSubs: string[]
  clientErrors: string[]
}

const INVITATION = { id: '11111111-1111-4111-8111-111111111111', title: 'Andi & Sari', website_name: 'Undangan Utama', gift_count: 2, reservation_count: 1, updated_at: '2026-10-16T08:00:00.000Z' }

export async function installMocks(page: Page, role: Role, opts: Partial<MockState> = {}): Promise<MockState> {
  const user = USERS[role]
  const state: MockState = { role, tokens: [], apiCalls: [], delayMs: 0, createdUsers: [], passwordResets: [], grants: [],
    reservations: [{ id: 'r1', invitation_id: '11111111-1111-4111-8111-111111111111', invitation_title: 'Andi & Sari', gift_id: 'g1', gift_name: 'Rice Cooker', guest_name: 'Budi', guest_whatsapp: '6281234567890', message: 'Selamat!', quantity: 1, status: 'confirmed', created_at: '2026-10-16T09:00:00.000Z', source: 'widget', admin_note: '' }],
    orders: [{ id: '33333333-3333-4333-8333-333333333333', website_id: '22222222-2222-4222-8222-222222222222', post_title: 'Pesan Undangan', post_id: 5, status: 'baru', source: 'widget', admin_note: '', created_at: '2026-10-16T10:00:00.000Z',
      entries: [{ key: 'groom_name', label: 'Nama Pria', value: 'Andi' }, { key: 'addons', label: 'Tambahan', value: ['musik'] }] }],
    mutations: [], extraGifts: 0,
    notifications: role === 'admin'
      ? [
          { id: 'a0000000-0000-4000-8000-000000000001', kind: 'order', title: 'Order undangan baru', body: 'Rina · Pesan Undangan', link: '/order-undangan?order=33333333-3333-4333-8333-333333333333', read_at: null, created_at: new Date(Date.now() - 5 * 60000).toISOString() },
          { id: 'a0000000-0000-4000-8000-000000000002', kind: 'reservation', title: 'Reservasi hadiah baru', body: 'Budi memilih Rice Cooker — Andi & Sari', link: '/daftar-hadiah/11111111-1111-4111-8111-111111111111', read_at: null, created_at: new Date(Date.now() - 3 * 3600000).toISOString() },
          { id: 'a0000000-0000-4000-8000-000000000003', kind: 'reservation', title: 'Reservasi hadiah baru', body: 'Siti memilih Blender — Andi & Sari', link: '/daftar-hadiah/11111111-1111-4111-8111-111111111111', read_at: '2026-10-15T10:00:00Z', created_at: '2026-10-14T10:00:00Z' },
        ]
      : [{ id: 'a0000000-0000-4000-8000-000000000009', kind: 'reservation', title: 'Reservasi hadiah baru', body: 'Budi memilih Rice Cooker — Andi & Sari', link: '/daftar-hadiah/11111111-1111-4111-8111-111111111111', read_at: null, created_at: new Date(Date.now() - 60000).toISOString() }],
    invitations: [{ ...INVITATION }, { ...INVITATION, id: '55555555-5555-4555-8555-555555555555', title: 'Rina & Doni', reservation_count: 0 }],
    events: [
      { order_id: '33333333-3333-4333-8333-333333333333', kind: 'akad', event_date: isoDay(2), event_time: '08:00', address: 'Masjid Raya', maps: 'https://maps.example/a', groom: 'Andi', bride: 'Sari', customer: 'Rina', post_title: 'Pesan Undangan', status: 'baru' },
      { order_id: '33333333-3333-4333-8333-333333333333', kind: 'resepsi', event_date: isoDay(2), event_time: '11:00', address: 'Gedung Serbaguna', maps: null, groom: 'Andi', bride: 'Sari', customer: 'Rina', post_title: 'Pesan Undangan', status: 'baru' },
      { order_id: '44444444-4444-4444-8444-444444444444', kind: 'akad', event_date: isoDay(30), event_time: null, address: null, maps: null, groom: 'Doni', bride: 'Rina', customer: null, post_title: 'Pesan 2', status: 'diproses' },
    ],
    audit: [
      { id: 2, action: 'access.grant', target: '11111111-1111-4111-8111-111111111111', actor: 'admin', created_at: '2026-10-16T11:00:00Z', detail: {} },
      { id: 1, action: 'user.create', target: '00000000-0000-4000-8000-000000000002', actor: 'admin', created_at: '2026-10-16T10:00:00Z', detail: {} },
    ],
    errors: [{ id: 1, source: 'server', status: 500, path: '/api/app/dashboard', message: 'Contoh error server', created_at: '2026-10-16T12:00:00Z', detail: { stack: 'Error: Contoh\n    at handler' } }],
    waTemplates: { access: null, recap: null },
    factors: [], pushSubs: [], clientErrors: [], ...opts }
  const token = fakeJwt(user.id, user.email || `${user.username}@akun.mdundig.invalid`)

  await page.route('https://supabase.mock/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/token') {
      const body = route.request().postDataJSON() as { email?: string; password?: string }
      if (body?.password !== 'kata-sandi-uji') return json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials' }, 400)
      return json(route, {
        access_token: token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh-uji',
        user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
      })
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname === '/auth/v1/recover') return json(route, {})
    if (url.pathname === '/auth/v1/user') return json(route, { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, factors: state.factors })
    const factorPath = /^\/auth\/v1\/factors(?:\/([^/]+))?(?:\/(challenge|verify))?$/.exec(url.pathname)
    if (factorPath) {
      const method = route.request().method()
      const [, id, op] = factorPath
      if (!id && method === 'POST') {
        const f = { id: `f${state.factors.length + 1}`, factor_type: 'totp' as const, status: 'unverified' as const, friendly_name: 'MDUNDIG' }
        state.factors.push(f)
        return json(route, { id: f.id, type: 'totp', friendly_name: f.friendly_name, totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/MDUNDIG' } })
      }
      if (id && method === 'DELETE') { state.factors = state.factors.filter((f) => f.id !== id); state.mutations.push(`mfa.unenroll:${id}`); return json(route, { id }) }
      if (id && op === 'challenge') return json(route, { id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 })
      if (id && op === 'verify') {
        const body = route.request().postDataJSON() as { code?: string }
        if (body?.code !== '123456') return json(route, { code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422)
        state.factors = state.factors.map((f) => (f.id === id ? { ...f, status: 'verified' as const } : f))
        state.mutations.push(`mfa.verify:${id}`)
        return json(route, {
          access_token: fakeJwt(user.id, user.email || `${user.username}@akun.mdundig.invalid`, 'aal2'), token_type: 'bearer', expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'refresh-uji-aal2',
          user: { id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email, factors: state.factors, app_metadata: {}, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
        })
      }
    }
    if (url.pathname.startsWith('/realtime/')) return route.abort()
    return json(route, {}, 404)
  })

  await page.route('**/api/app/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    state.apiCalls.push(`${req.method()} ${path}`)
    // Meniru POST /api/app/auth/login (username ATAU email). Password uji hanya untuk mock.
    if (path === '/api/app/auth/login') {
      const body = req.postDataJSON() as { identifier?: string; password?: string }
      const id = String(body?.identifier ?? '').trim().toLowerCase()
      if ((id === user.username || (user.email && id === user.email)) && body?.password === 'kata-sandi-uji') {
        return json(route, { session: { access_token: token, refresh_token: 'refresh-uji', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer' } })
      }
      return json(route, { data: { message: 'Username/email atau password salah.' } }, 401)
    }
    // Seperti server asli: token sah bila milik pengguna ini (token baru setelah verifikasi dua langkah juga diterima).
    if (jwtClaims(req.headers().authorization).sub !== user.id) return json(route, { data: { message: 'Silakan masuk kembali.' } }, 401)
    if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs))
    const isAdmin = role === 'admin'
    // Server sungguhan menolak pelanggan pada /api/app/admin/** — mock meniru perilaku tsb.
    if (path.startsWith('/api/app/admin/') && !isAdmin) return json(route, { data: { message: 'Halaman ini khusus admin platform.' } }, 403)

    if (state.factors.some((f) => f.status === 'verified') && jwtClaims(req.headers().authorization).aal !== 'aal2' && path !== '/api/app/client-error') {
      return json(route, { statusCode: 401, statusMessage: 'mfa_required', data: { message: 'Masukkan kode verifikasi dua langkah dari aplikasi authenticator.' } }, 401)
    }
    if (path === '/api/app/me') return json(route, { ...user, role, created_at: '2026-10-01T00:00:00Z' })
    if (path === '/api/app/admin/events') {
      const from = url.searchParams.get('from') ?? '0000'
      const to = url.searchParams.get('to') ?? '9999'
      return json(route, { items: state.events.filter((e) => String(e.event_date) >= from && String(e.event_date) <= to) })
    }
    if (path === '/api/app/admin/audit') {
      const action = url.searchParams.get('action')
      const items = state.audit.filter((a) => !action || String(a.action).startsWith(`${action}.`))
      return json(route, { items, total: items.length, page: 1, per_page: 30 })
    }
    if (path === '/api/app/admin/errors' && req.method() === 'DELETE') { const n = state.errors.length; state.errors = []; state.mutations.push('errors.clear'); return json(route, { deleted: n }) }
    if (path === '/api/app/admin/errors') {
      const src = url.searchParams.get('source')
      const items = state.errors.filter((e) => !src || e.source === src)
      return json(route, { items, total: items.length, page: 1, per_page: 30 })
    }
    if (path === '/api/app/admin/settings/whatsapp' && req.method() === 'PUT') {
      const b = req.postDataJSON() as { access_template?: string | null; recap_template?: string | null }
      if (typeof b.access_template === 'string' && !b.access_template.includes('{password}')) return json(route, { data: { message: 'Pesan akses akun wajib memuat {password}.' } }, 400)
      if ('access_template' in b) state.waTemplates.access = b.access_template || null
      if ('recap_template' in b) state.waTemplates.recap = b.recap_template || null
      state.mutations.push('settings.whatsapp')
      return json(route, { ok: true })
    }
    if (path === '/api/app/admin/settings/whatsapp') {
      return json(route, { access_template: state.waTemplates.access, recap_template: state.waTemplates.recap, defaults: { access: DEFAULT_ACCESS, recap: DEFAULT_RECAP } })
    }
    const recapPath = /\/api\/app\/admin\/invitations\/([^/]+)\/recap$/.exec(path)
    if (recapPath) {
      const confirmed = state.reservations.filter((r) => r.invitation_id === recapPath[1] && r.status === 'confirmed')
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      const grant = state.grants.find((g) => g.invitation_id === recapPath[1])
      const holderUser = grant ? [{ ...USERS.customer, whatsapp: '6281277778888' }, ...state.createdUsers].find((u) => u.id === grant.user_id) : null
      return json(route, { title: 'Andi & Sari', website_name: 'Undangan Utama', total: confirmed.length,
        latest: confirmed.slice(0, 6).map((r) => ({ gift: String(r.gift_name), guest: String(r.guest_name) })),
        holder: holderUser ? { id: holderUser.id, username: holderUser.username, name: holderUser.display_name || holderUser.username, whatsapp: (holderUser as { whatsapp?: string | null }).whatsapp ?? null } : null })
    }
    if (path === '/api/app/client-error') { state.clientErrors.push(String((req.postDataJSON() as { message?: string }).message)); return json(route, { ok: true }, 202) }
    if (path === '/api/app/push/subscribe' && req.method() === 'POST') { state.pushSubs.push(String((req.postDataJSON() as { endpoint?: string }).endpoint)); return json(route, { ok: true }, 201) }
    if (path === '/api/app/push/subscribe' && req.method() === 'DELETE') { state.pushSubs = []; return json(route, { ok: true }) }
    if (path === '/api/app/dashboard') {
      const days = Number(url.searchParams.get('days') || 7)
      const today = new Date('2026-10-16T00:00:00Z')
      const trend = Array.from({ length: days }, (_, i) => {
        const d = new Date(today.getTime() - (days - 1 - i) * 86400000).toISOString().slice(0, 10)
        return { date: d, confirmed: [0, 2, 1, 3, 1, 4, 2][i % 7]!, cancelled: i % 5 === 0 ? 1 : 0 }
      })
      const base = {
        today: '2026-10-16', days,
        kpis: {
          invitations: { total: state.invitations.length, this_week: 2, last_week: 1, series: [0, 0, 1, 0, 0, 1, 0] },
          gifts: { total: 4, this_week: 4, last_week: 0, series: [0, 0, 0, 0, 2, 2, 0] },
          reservations: { total: state.reservations.filter((r) => r.status === 'confirmed').length, this_week: 1, last_week: 1, series: [0, 0, 1, 0, 0, 0, 0] },
        },
        trend,
        status: { confirmed: 3, cancelled: 1 },
        top_gifts: isAdmin || state.invitations.length ? [
          { gift_id: 'g1', name: 'Rice Cooker', image_url: '', invitation_title: 'Andi & Sari', count: 1 },
          { gift_id: 'g2', name: 'Blender', image_url: '', invitation_title: 'Andi & Sari', count: 0 },
        ] : [],
      }
      if (!isAdmin) return json(route, { ...base, activity: [{ type: 'reservation', title: 'Budi memilih Rice Cooker', subtitle: 'Andi & Sari', at: '2026-10-16T09:00:00.000Z' }] })
      return json(route, {
        ...base,
        websites: { total: 1, active: 1, active_tokens: state.tokens.filter((t) => !t.revoked_at).length, series: [0, 0, 0, 0, 1, 1, 1] },
        orders: {
          total: state.orders.length, today: state.orders.length, week: state.orders.length, month: state.orders.length, new: state.orders.filter((o) => o.status === 'baru').length,
          latest: state.orders.slice(0, 5).map((o) => ({ id: o.id, name: 'Rina Kartika', contact: 'rina@example.com', status: o.status, created_at: o.created_at })),
        },
        activity: [
          { type: 'reservation', title: 'Budi memilih Rice Cooker', subtitle: 'Andi & Sari', at: '2026-10-16T09:00:00.000Z' },
          { type: 'order', title: 'Order masuk', subtitle: 'Rina Kartika', at: '2026-10-16T08:00:00.000Z' },
          { type: 'audit:website.create', title: 'website.create', subtitle: 'Admin', at: '2026-10-15T08:00:00.000Z' },
        ],
      })
    }
    if (path === '/api/app/summary') {
      return json(route, {
        registry: { invitations: 1, gifts: 2, reservations: 1 },
        recent: [{ id: 'r1', invitation_id: INVITATION.id, invitation_title: INVITATION.title, gift_name: 'Rice Cooker', guest_name: 'Budi', created_at: '2026-10-16T09:00:00.000Z' }],
        ...(isAdmin ? { platform: { websites: 1, active_tokens: state.tokens.filter((t) => !t.revoked_at).length, invitations: 3, unmapped_invitations: 2, reservations: 5, form_orders: 4 } } : {}),
      })
    }
    if (path === '/api/app/invitations') {
      const items = state.invitations.map((i) => ({ ...i, access_count: state.grants.filter((g) => g.invitation_id === i.id).length, mapped_user_count: 0 }))
      return json(route, { items, total: items.length, page: 1, per_page: 20 })
    }
    if (path === '/api/app/admin/invitations/delete' && req.method() === 'POST') {
      const ids = (req.postDataJSON() as { ids: string[] }).ids
      const removed = state.invitations.filter((i) => ids.includes(i.id as string))
      state.invitations = state.invitations.filter((i) => !ids.includes(i.id as string))
      state.mutations.push(`invitation.delete:${ids.length}`)
      return json(route, { invitations: removed.length, reservations: removed.reduce((n, i) => n + Number(i.reservation_count), 0) })
    }
    if (path === '/api/app/reservations') {
      const per = Number(url.searchParams.get('per_page') || 20)
      const pg = Number(url.searchParams.get('page') || 1)
      return json(route, { items: state.reservations.slice((pg - 1) * per, pg * per), total: state.reservations.length, page: pg, per_page: per })
    }
    if (path === `/api/app/invitations/${INVITATION.id}` && req.method() === 'GET') {
      return json(route, { invitation: { ...INVITATION, created_at: '2026-10-01T00:00:00Z' }, registries: [],
        gifts: [{ id: 'g1', registry_id: 'x', gift_key: 'gift-1', name: 'Rice Cooker', description: '', initial_quantity: 5, capacity: 4, manual_status: 'available', active: true, reserved_quantity: 1, available_quantity: 3 },
                { id: 'g2', registry_id: 'x', gift_key: 'gift-2', name: 'Blender', description: '', initial_quantity: 1, capacity: 1, manual_status: 'available', active: true, reserved_quantity: 1, available_quantity: 0 },
                ...Array.from({ length: state.extraGifts }, (_, i) => ({ id: `gx${i}`, registry_id: 'x', gift_key: `gift-x${i}`, name: `Hadiah ${i + 3}`, description: 'Hadiah tambahan', initial_quantity: 2, capacity: 2, manual_status: 'available', active: true, reserved_quantity: 0, available_quantity: 2 }))] })
    }
    // ---- CRUD admin (meniru validasi & pesan server)
    if (path === '/api/app/admin/reservations' && req.method() === 'POST') {
      const b = req.postDataJSON() as Record<string, string>
      state.mutations.push('reservation.create')
      state.reservations.unshift({ id: `r${state.reservations.length + 2}`, invitation_id: INVITATION.id, invitation_title: INVITATION.title, gift_id: b.gift_id, gift_name: 'Rice Cooker', guest_name: b.guest_name, guest_whatsapp: '62' + String(b.guest_whatsapp).replace(/^0/, ''), message: b.message, quantity: 1, status: 'confirmed', created_at: new Date().toISOString(), source: 'admin', admin_note: b.admin_note })
      return json(route, { id: 'new' }, 201)
    }
    const resId = /\/api\/app\/admin\/reservations\/([^/]+)$/.exec(path)
    if (resId && req.method() === 'PATCH') { const b = req.postDataJSON() as Record<string, string>; const r = state.reservations.find((x) => x.id === resId[1]); if (r) Object.assign(r, { guest_name: b.guest_name, message: b.message, status: b.status, admin_note: b.admin_note }); state.mutations.push('reservation.update'); return json(route, { ok: true }) }
    if (resId && req.method() === 'DELETE') { state.reservations = state.reservations.filter((x) => x.id !== resId[1]); state.mutations.push('reservation.delete'); return json(route, { ok: true }) }
    if (path === '/api/app/admin/form-orders' && req.method() === 'POST') {
      const b = req.postDataJSON() as { website_id: string; post_title: string; status: string; admin_note: string; entries: Array<{ label: string; value: string }> }
      const id = '44444444-4444-4444-8444-44444444444' + state.orders.length
      state.orders.unshift({ id, website_id: b.website_id, post_title: b.post_title || 'Order manual', post_id: null, status: b.status, source: 'admin', admin_note: b.admin_note, created_at: new Date().toISOString(), entries: b.entries.map((e, i) => ({ key: `f${i}`, ...e })) })
      state.mutations.push('order.create')
      return json(route, { id }, 201)
    }
    const orderId = /\/api\/app\/admin\/form-orders\/([0-9a-f-]{36})$/.exec(path)
    if (orderId) {
      const o = state.orders.find((x) => x.id === orderId[1])
      if (!o) return json(route, { data: { message: 'Data tidak ditemukan.' } }, 404)
      if (req.method() === 'GET') return json(route, { ...o, website: { name: 'Undangan Utama', site_url: 'https://undangan.example.com/' }, request_id: 'a'.repeat(64), document_id: null, element_id: null, updated_at: o.created_at })
      if (req.method() === 'PATCH') {
        const b = req.postDataJSON() as Record<string, unknown>
        // Meniru server: isi order dari widget hanya-lihat.
        if (o.source !== 'admin' && (b.entries !== undefined || b.post_title !== undefined)) return json(route, { data: { message: 'Isi order dari widget hanya dapat dilihat. Ubah status atau catatan admin saja.' } }, 409)
        Object.assign(o, b); state.mutations.push('order.update'); return json(route, { ok: true })
      }
      if (req.method() === 'DELETE') { state.orders = state.orders.filter((x) => x !== o); state.mutations.push('order.delete'); return json(route, { ok: true }) }
    }
    if (/\/api\/app\/admin\/websites\/[^/]+$/.test(path) && req.method() === 'DELETE') {
      state.mutations.push('website.delete')
      return json(route, { data: { message: 'Website masih memiliki 1 undangan dan 1 order. Ubah status menjadi Nonaktif untuk menghentikan koneksi.' } }, 409)
    }
    const tokId = /\/api\/app\/admin\/tokens\/([^/]+)$/.exec(path)
    if (tokId && req.method() === 'PATCH') { const t = state.tokens.find((x) => x.id === tokId[1]); if (t) t.label = (req.postDataJSON() as { label: string }).label; return json(route, { ok: true }) }
    if (tokId && req.method() === 'DELETE') { state.tokens = state.tokens.filter((x) => x.id !== tokId[1]); state.mutations.push('token.delete'); return json(route, { ok: true }) }
    const userId = /\/api\/app\/admin\/users\/([0-9a-f-]{36})$/.exec(path)
    if (userId && req.method() === 'PATCH') {
      const b = req.postDataJSON() as Record<string, string>
      const u = state.createdUsers.find((x) => x.id === userId[1])
      if (u) Object.assign(u, { username: b.username, display_name: b.display_name, email: b.email, ...(b.whatsapp !== undefined ? { whatsapp: b.whatsapp ? '62' + b.whatsapp.replace(/\D/g, '').replace(/^(62|0)/, '') : null } : {}) })
      state.mutations.push(`user.update:${b.role ?? '-'}`)
      return json(route, { ok: true })
    }
    if (userId && req.method() === 'DELETE') { state.createdUsers = state.createdUsers.filter((x) => x.id !== userId[1]); state.mutations.push('user.delete'); return json(route, { ok: true }) }
    if (path === '/api/app/reservations/export-pdf' || path === '/api/app/admin/form-orders/export-pdf') {
      const name = path.includes('form-orders') ? 'laporan-order-undangan-uji.pdf' : 'laporan-reservasi-uji.pdf'
      return route.fulfill({ status: 200, contentType: 'application/pdf', headers: { 'content-disposition': `attachment; filename="${name}"` }, body: '%PDF-1.7 %%EOF' })
    }
    if (path === '/api/app/reservations/export') {
      return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', headers: { 'content-disposition': 'attachment; filename="daftar-hadiah-reservasi-uji.csv"' }, body: '﻿Judul undangan,Nama hadiah\r\nAndi & Sari,Rice Cooker\r\n' })
    }
    if (path === '/api/app/admin/websites') return json(route, { items: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Undangan Utama', site_url: 'https://undangan.example.com/', external_site_id: null, bound_at: null, status: 'active', created_at: '2026-10-01T00:00:00Z', active_tokens: 0, last_used_at: null }] })
    if (path === '/api/app/admin/connection') return json(route, { daftar_hadiah_url: 'https://daftar-hadiah.example.com/api/daftar-hadiah', form_order_url: 'https://daftar-hadiah.example.com/api/form-order', https: true })
    if (/\/api\/app\/admin\/websites\/[^/]+\/tokens$/.test(path)) {
      if (req.method() === 'POST') {
        const t = { id: `t${state.tokens.length + 1}`, label: 'Produksi', token_hint: '…beef', scopes: ['daftar_hadiah', 'form_order'], created_at: new Date().toISOString(), last_used_at: null, revoked_at: null }
        state.tokens.unshift(t)
        return json(route, { ...t, token: 'mdh_' + '0123456789abcdef'.repeat(3) + 'deadbeefdeadbeef' }, 201)
      }
      return json(route, { items: state.tokens })
    }
    const revoke = /\/api\/app\/admin\/tokens\/([^/]+)\/revoke$/.exec(path)
    if (revoke) { const t = state.tokens.find((x) => x.id === revoke[1]); if (t) t.revoked_at = new Date().toISOString(); return json(route, { ok: true }) }
    if (path === '/api/app/admin/form-orders') {
      const items = state.orders.map((o) => {
        const e = (o.entries as Array<{ key: string; label: string; value: string | string[] }>).filter((x) => (Array.isArray(x.value) ? x.value.length : String(x.value).trim()))
        return { ...o, website_name: 'Undangan Utama', field_count: e.length, filled_count: e.length, summary: e.slice(0, 3).map((x) => `${x.label}: ${Array.isArray(x.value) ? x.value.join(', ') : x.value}`).join(' · ') }
      })
      return json(route, { items, total: items.length, page: 1, per_page: 20 })
    }
    if (path === '/api/app/admin/users' && req.method() === 'POST') {
      const b = req.postDataJSON() as { username: string; display_name: string; email: string; whatsapp?: string; password: string; invitation_ids?: string[] }
      const username = b.username.trim().toLowerCase()
      if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return json(route, { data: { message: 'Username tidak valid.' } }, 422)
      if (b.password.length < 8) return json(route, { data: { message: 'Password minimal 8 karakter.' } }, 422)
      const digits = String(b.whatsapp ?? '').replace(/[\s().+-]/g, '')
      const whatsapp = digits.startsWith('0') ? '62' + digits.slice(1) : digits
      if (!/^[1-9][0-9]{7,14}$/.test(whatsapp)) return json(route, { data: { message: 'Nomor WhatsApp wajib diisi untuk mengirim akses akun ke pelanggan.' } }, 400)
      if ([USERS.admin.username, USERS.customer.username, ...state.createdUsers.map((u) => u.username)].includes(username)) return json(route, { data: { message: 'Username sudah dipakai.' } }, 409)
      const created = { id: `00000000-0000-4000-8000-0000000001${String(state.createdUsers.length).padStart(2, '0')}`, username, display_name: b.display_name, email: b.email, whatsapp, role: 'customer' as const, created_at: new Date().toISOString() }
      state.createdUsers.push(created)
      if ((b.invitation_ids ?? []).some((id) => state.grants.some((g) => g.invitation_id === id))) return json(route, { data: { message: 'Undangan sudah dipakai akun lain. Satu undangan hanya untuk satu akun pelanggan.' } }, 409)
      for (const invitation_id of b.invitation_ids ?? []) state.grants.push({ invitation_id, user_id: created.id })
      return json(route, { id: created.id, username, email: b.email || null, whatsapp, granted: (b.invitation_ids ?? []).length, access_failed: false }, 201)
    }
    const pw = /\/api\/app\/admin\/users\/([^/]+)\/password$/.exec(path)
    if (pw) {
      state.passwordResets.push(pw[1] as string)
      const u = state.createdUsers.find((x) => x.id === pw[1])
      if (u) u.whatsapp_sent_at = null
      return json(route, { ok: true })
    }
    const waSent = /\/api\/app\/admin\/users\/([^/]+)\/whatsapp-sent$/.exec(path)
    if (waSent) {
      const b = req.postDataJSON() as { whatsapp?: string }
      const u = state.createdUsers.find((x) => x.id === waSent[1])
      const res = { whatsapp: b.whatsapp ?? u?.whatsapp ?? null, whatsapp_sent_at: new Date().toISOString() }
      if (u) Object.assign(u, res)
      state.mutations.push(`whatsapp.sent:${waSent[1]}`)
      return json(route, res)
    }
    if (path === '/api/app/admin/users') {
      const count = (id: string) => state.grants.filter((g) => g.user_id === id).length
      const titleOf = (id: string) => { const g = state.grants.find((x) => x.user_id === id); return g ? String(state.invitations.find((i) => i.id === g.invitation_id)?.title ?? 'Tanpa judul') : null }
      const items = [{ ...USERS.admin, role: 'admin', created_at: '2026-10-01T00:00:00Z' }, { ...USERS.customer, role: 'customer', created_at: '2026-10-01T00:00:00Z' }, ...state.createdUsers]
        .map((u) => ({ whatsapp: null, whatsapp_sent_at: null, ...u, access_count: count(u.id), access_title: titleOf(u.id), access_invitation_id: state.grants.find((g) => g.user_id === u.id)?.invitation_id ?? null }))
      return json(route, { items, total: items.length, page: 1, per_page: 50 })
    }
    if (path === '/api/app/admin/owner-mappings') return json(route, { items: [] })
    if (path === '/api/app/admin/owner-ids') return json(route, { items: [] })
    const userAccess = /\/api\/app\/admin\/users\/([^/]+)\/access$/.exec(path)
    if (userAccess && req.method() === 'GET') return json(route, { invitation_ids: state.grants.filter((g) => g.user_id === userAccess[1]).map((g) => g.invitation_id) })
    if (userAccess && req.method() === 'PUT') {
      const uid = userAccess[1] as string
      const ids = (req.postDataJSON() as { invitation_ids: string[] }).invitation_ids
      if (ids.length > 1) return json(route, { data: { message: 'Satu akun pelanggan hanya dapat mengakses satu undangan. Pilih salah satu.' } }, 400)
      if (ids.some((id) => state.grants.some((g) => g.invitation_id === id && g.user_id !== uid))) return json(route, { data: { message: 'Undangan sudah dipakai akun lain. Satu undangan hanya untuk satu akun pelanggan.' } }, 409)
      const have = state.grants.filter((g) => g.user_id === uid).map((g) => g.invitation_id)
      state.grants = [...state.grants.filter((g) => g.user_id !== uid), ...ids.map((invitation_id) => ({ invitation_id, user_id: uid }))]
      state.mutations.push(`access.set:${ids.length}`)
      return json(route, { granted: ids.filter((i) => !have.includes(i)).length, revoked: have.filter((i) => !ids.includes(i)).length, total: ids.length })
    }
    const access = /\/api\/app\/admin\/invitations\/([^/]+)\/access(?:\/([^/]+))?$/.exec(path)
    if (access && req.method() === 'GET') {
      const all = [{ ...USERS.customer }, ...state.createdUsers]
      return json(route, { owner_external_id: null, mapped: [], explicit: state.grants.filter((g) => g.invitation_id === access[1]).map((g) => ({ user_id: g.user_id, created_at: '2026-10-16T10:00:00Z', profiles: all.find((u) => u.id === g.user_id) ?? null })) })
    }
    if (access && req.method() === 'POST' && state.grants.some((g) => g.user_id === (req.postDataJSON() as { user_id: string }).user_id && g.invitation_id !== access[1])) {
      return json(route, { data: { message: 'Akun ini sudah punya akses ke undangan lain. Satu akun pelanggan hanya dapat mengakses satu undangan.' } }, 409)
    }
    if (access && req.method() === 'POST' && state.grants.some((g) => g.invitation_id === access[1])) return json(route, { data: { message: 'Undangan sudah dipakai akun lain. Satu undangan hanya untuk satu akun pelanggan.' } }, 409)
    if (access && req.method() === 'POST') { state.grants.push({ invitation_id: access[1] as string, user_id: (req.postDataJSON() as { user_id: string }).user_id }); return json(route, { ok: true }, 201) }
    if (access && req.method() === 'DELETE') { state.grants = state.grants.filter((g) => !(g.invitation_id === access[1] && g.user_id === access[2])); return json(route, { ok: true }) }
    // ---- Notifikasi (milik pengguna yang masuk)
    if (path === '/api/app/notifications/count') return json(route, { unread: state.notifications.filter((n) => !n.read_at).length })
    if (path === '/api/app/notifications' && req.method() === 'GET') {
      let items = state.notifications
      if (url.searchParams.get('unread') === '1') items = items.filter((n) => !n.read_at)
      const kind = url.searchParams.get('kind')
      if (kind) items = items.filter((n) => n.kind === kind)
      const per = Number(url.searchParams.get('per_page') || 20)
      return json(route, { items: items.slice(0, per), total: items.length, page: 1, per_page: per, unread: state.notifications.filter((n) => !n.read_at).length })
    }
    if (path === '/api/app/notifications/read' && req.method() === 'POST') {
      const b = req.postDataJSON() as { ids?: string[]; all?: boolean }
      let updated = 0
      for (const n of state.notifications) if (!n.read_at && (b.all || b.ids?.includes(n.id))) { n.read_at = new Date().toISOString(); updated++ }
      state.mutations.push('notif.read:' + updated)
      return json(route, { updated })
    }
    if (path === '/api/app/notifications/delete' && req.method() === 'POST') {
      const b = req.postDataJSON() as { ids?: string[]; read?: boolean; all?: boolean }
      const before = state.notifications.length
      state.notifications = b.all ? [] : state.notifications.filter((n) => (b.read ? !n.read_at : !b.ids?.includes(n.id)))
      state.mutations.push('notif.delete:' + (before - state.notifications.length))
      return json(route, { deleted: before - state.notifications.length })
    }
    if (path === '/api/app/me' && req.method() === 'PATCH') return json(route, { ok: true })
    return json(route, { data: { message: 'Tidak ditemukan.' } }, 404)
  })
  return state
}

export async function login(page: Page, role: Role) {
  await page.goto('/login')
  await page.getByLabel('Username atau email').fill(USERS[role].username)
  await page.getByLabel('Password', { exact: true }).fill('kata-sandi-uji')
  await page.getByRole('button', { name: 'Masuk' }).click()
  await page.waitForURL('**/')
  await page.getByRole('heading', { name: 'Ringkasan' }).waitFor()
}

export async function openNav(page: Page) {
  const burger = page.getByRole('button', { name: 'Buka menu' })
  if (await burger.isVisible()) await burger.click()
}
