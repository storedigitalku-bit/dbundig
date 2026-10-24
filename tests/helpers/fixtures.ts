import { randomUUID } from 'node:crypto'

export const SITE_A = 'site-' + 'a'.repeat(32)
export const SITE_B = 'site-' + 'b'.repeat(32)
export const URL_A = 'https://undangan-a.example.com/'
export const URL_B = 'https://example.org/blog/'
export const TOKEN_A = 'mdh_' + '1a'.repeat(32)
export const TOKEN_B = 'mdh_' + '2b'.repeat(32)
export const HASH_SECRET = 'test-only-hash-secret-0123456789abcdef'

export function gift(id: string, initial: number, capacity: number, availability: 'available' | 'unavailable' = 'available', name = id) {
  return { gift_id: id, name, description: '', image_url: '', purchase_url: '', initial_quantity: initial, available_quantity: capacity, availability }
}

export function catalog(over: Record<string, unknown> = {}) {
  return {
    invitation_id: 101,
    invitation_title: 'Andi & Sari',
    registry_id: 'registry-900-abc',
    document_id: 900,
    element_id: 'abc',
    catalog_version: '1760000000001',
    catalog_hash: 'c'.repeat(64),
    owner_id: null as string | null,
    gifts: [gift('gift-stable', 5, 4, 'available', 'Rice Cooker'), gift('gift-one', 1, 1, 'available', 'Blender')],
    ...over,
  }
}

export function dhBody(operation: string, extra: Record<string, unknown> = {}, site = SITE_A, url = URL_A) {
  return {
    service: 'apeiron-daftar-hadiah', schema_version: 1, operation, correlation_id: randomUUID(),
    website_id: site, website_url: url, ...extra,
  }
}

export function foBody(operation: string, extra: Record<string, unknown> = {}, site = SITE_A, url = URL_A) {
  return {
    service: 'apeiron-form-order', schema_version: 1, operation, correlation_id: randomUUID(),
    website_id: site, website_url: url, visibility: 'admin_only', ...extra,
  }
}

export function reserveExtra(requestChar: string, whatsapp: string, giftId = 'gift-stable', message = 'Selamat') {
  return { gift_id: giftId, quantity: 1, request_id: requestChar.repeat(64).slice(0, 64), guest: { name: 'Tamu', whatsapp }, message }
}

export function hex64(n: number): string {
  return n.toString(16).padStart(64, '0')
}
