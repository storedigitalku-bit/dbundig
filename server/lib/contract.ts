/**
 * Kontrak integrasi plugin ApeironKit — murni (tanpa dependensi Nuxt) agar dapat diuji.
 * Sumber: plugins/Apeiron/src/Support/DaftarHadiahGateway.php, DaftarHadiahCatalog.php,
 * Admin/Ajax/DaftarHadiahHandler.php, Support/FormOrderSettings.php.
 */

export const DH_SERVICE = 'apeiron-daftar-hadiah'
export const DH_VERSION = 'registry-api-v1'
export const FO_SERVICE = 'apeiron-form-order'
export const FO_VERSION = 'form-order-api-v1'

export const DH_OPERATIONS = ['ping', 'sync_catalog', 'availability', 'reserve', 'reservations'] as const
export const FO_OPERATIONS = ['ping', 'submit'] as const
export type DhOperation = (typeof DH_OPERATIONS)[number]
export type FoOperation = (typeof FO_OPERATIONS)[number]

export const ERROR_STATUS: Record<string, number> = {
  invalid_request: 422,
  invalid_catalog: 422,
  catalog_stale: 409,
  gift_unavailable: 409,
  request_conflict: 409,
  busy: 503,
  not_initialized: 503,
  rate_limited: 429,
  unauthorized: 401,
  forbidden: 403,
  method_not_allowed: 405,
  payload_too_large: 413,
  unsupported_media_type: 415,
  script_error: 500,
}

/** Kode yang dihasilkan database (RAISE EXCEPTION '<kode>'). */
export const DB_ERROR_CODES = new Set([
  'invalid_request', 'invalid_catalog', 'catalog_stale', 'gift_unavailable', 'request_conflict', 'busy', 'not_initialized',
])

export const RE = {
  websiteId: /^site-[a-f0-9]{32}$/,
  registryId: /^registry-[1-9][0-9]*-[A-Za-z0-9_-]{1,100}$/,
  elementId: /^[A-Za-z0-9_-]{1,100}$/,
  giftId: /^gift-[A-Za-z0-9_-]{1,100}$/,
  hex64: /^[a-f0-9]{64}$/,
  catalogVersion: /^[0-9]{1,16}$/,
  ownerId: /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/,
  whatsapp: /^[1-9][0-9]{7,14}$/,
  bearer: /^Bearer ([A-Za-z0-9._~-]{24,512})$/,
  fieldKey: /^[A-Za-z0-9_.:-]{1,128}$/,
  // eslint-disable-next-line no-control-regex
  control: /[\u0000-\u001f\u007f]/,
}

export class ContractError extends Error {
  constructor(public code: string) {
    super(code)
  }
}

type Json = Record<string, unknown>

export const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
/** Panjang dalam code point — sama dengan char_length() PostgreSQL. */
export const cpLength = (s: string): number => {
  let n = 0
  for (const _ of s) n++
  return n
}
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && cpLength(v) <= max

/** Normalisasi home_url('/') maupun URL yang didaftarkan admin. */
export function normalizeSiteUrl(input: string): string | null {
  if (typeof input !== 'string' || input.length > 2048 || RE.control.test(input)) return null
  let raw = input.trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw) && !/^[^/:]+:\d+(?:\/|$)/.test(raw)) return null
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) return null
  let path = url.pathname || '/'
  if (!path.endsWith('/')) path += '/'
  return `${url.protocol}//${url.host.toLowerCase()}${path}`
}

export interface Envelope {
  service: string
  schema_version: 1
  operation: string
  correlation_id: string
  website_id: string
  website_url: string
}

/** Nilai yang dipantulkan apa adanya dalam respons, bahkan saat request tidak valid. */
export function echoFields(body: unknown): { operation: string; correlation_id: string } {
  const o = isObject(body) ? body : {}
  return {
    operation: typeof o.operation === 'string' && o.operation.length <= 64 ? o.operation : '',
    correlation_id: typeof o.correlation_id === 'string' && o.correlation_id.length <= 128 ? o.correlation_id : '',
  }
}

export function validateEnvelope(body: unknown, service: string, operations: readonly string[]): Envelope {
  if (!isObject(body)) throw new ContractError('invalid_request')
  if (body.service !== service || body.schema_version !== 1) throw new ContractError('invalid_request')
  if (typeof body.operation !== 'string' || !operations.includes(body.operation)) throw new ContractError('invalid_request')
  if (typeof body.correlation_id !== 'string' || body.correlation_id.length < 1 || body.correlation_id.length > 128
      || RE.control.test(body.correlation_id)) throw new ContractError('invalid_request')
  if (typeof body.website_id !== 'string' || !RE.websiteId.test(body.website_id)) throw new ContractError('invalid_request')
  if (typeof body.website_url !== 'string' || !normalizeSiteUrl(body.website_url)) throw new ContractError('invalid_request')
  return body as unknown as Envelope
}

export interface CatalogGift {
  gift_id: string
  name: string
  description: string
  image_url: string
  purchase_url: string
  initial_quantity: number
  available_quantity: number
  availability: 'available' | 'unavailable'
}

export interface CatalogContext {
  invitation_id: number
  invitation_title: string
  registry_id: string
  document_id: number
  element_id: string
  catalog_version: string
  catalog_hash: string
  owner_id: string | null
  gifts: CatalogGift[]
}

const urlOrEmpty = (v: unknown): v is string => isText(v, 2048) && (v === '' || /^https?:\/\//i.test(v))

/** Validasi konteks katalog. Hash TIDAK dihitung ulang (serialisasi PHP ≠ JS). */
export function validateCatalog(body: Json): CatalogContext {
  if (!isInt(body.invitation_id, 1, Number.MAX_SAFE_INTEGER)) throw new ContractError('invalid_request')
  if (typeof body.registry_id !== 'string' || !RE.registryId.test(body.registry_id)) throw new ContractError('invalid_request')
  if (!('owner_id' in body) || (body.owner_id !== null && (typeof body.owner_id !== 'string' || !RE.ownerId.test(body.owner_id)))) {
    throw new ContractError('invalid_request')
  }
  if (!isInt(body.document_id, 1, Number.MAX_SAFE_INTEGER) || typeof body.element_id !== 'string' || !RE.elementId.test(body.element_id)
      || body.registry_id !== `registry-${body.document_id}-${body.element_id}`) throw new ContractError('invalid_catalog')
  if (typeof body.catalog_version !== 'string' || !RE.catalogVersion.test(body.catalog_version)
      || !Number.isSafeInteger(Number(body.catalog_version))) throw new ContractError('invalid_catalog')
  if (typeof body.catalog_hash !== 'string' || !RE.hex64.test(body.catalog_hash)) throw new ContractError('invalid_catalog')
  if (!isText(body.invitation_title, 1000)) throw new ContractError('invalid_catalog')
  if (!Array.isArray(body.gifts) || body.gifts.length > 200) throw new ContractError('invalid_catalog')
  const seen = new Set<string>()
  for (const g of body.gifts as unknown[]) {
    if (!isObject(g) || typeof g.gift_id !== 'string' || !RE.giftId.test(g.gift_id) || seen.has(g.gift_id)
        || typeof g.name !== 'string' || g.name.trim() === '' || cpLength(g.name) > 600
        || !isText(g.description, 20000) || !urlOrEmpty(g.image_url) || !urlOrEmpty(g.purchase_url)
        || !isInt(g.initial_quantity, 0, 1_000_000)
        || !isInt(g.available_quantity, 0, g.initial_quantity as number)
        || (g.availability !== 'available' && g.availability !== 'unavailable')) {
      throw new ContractError('invalid_catalog')
    }
    seen.add(g.gift_id)
  }
  return body as unknown as CatalogContext
}

export interface ReserveInput {
  gift_id: string
  quantity: 1
  request_id: string
  guest: { name: string; whatsapp: string }
  message: string
}

export function validateReserve(body: Json): ReserveInput {
  const guest = body.guest
  if (typeof body.gift_id !== 'string' || !RE.giftId.test(body.gift_id) || body.quantity !== 1
      || typeof body.request_id !== 'string' || !RE.hex64.test(body.request_id)
      || !isObject(guest) || typeof guest.name !== 'string' || guest.name.trim() === '' || cpLength(guest.name) > 100
      || typeof guest.whatsapp !== 'string' || !RE.whatsapp.test(guest.whatsapp)
      || !isText(body.message, 1000)) {
    throw new ContractError('invalid_request')
  }
  return body as unknown as ReserveInput
}

export function validateOffset(body: Json): number {
  const offset = body.offset === undefined || body.offset === null ? 0 : body.offset
  if (!isInt(offset, 0, 10_000_000)) throw new ContractError('invalid_request')
  return offset
}

export interface FormOrderSubmission {
  post_id: number
  post_title: string
  document_id: number
  element_id: string
  request_id: string
  fields: Record<string, string | string[]>
  labels: Record<string, string>
}

export function validateFormOrderEnvelope(body: Json): void {
  if (body.visibility !== 'admin_only') throw new ContractError('invalid_request')
}

export function validateFormOrderSubmission(body: Json): FormOrderSubmission {
  if (!isInt(body.post_id, 1, Number.MAX_SAFE_INTEGER) || !isInt(body.document_id, 1, Number.MAX_SAFE_INTEGER)
      || typeof body.element_id !== 'string' || !RE.elementId.test(body.element_id)
      || !isText(body.post_title, 1000)
      || typeof body.request_id !== 'string' || !RE.hex64.test(body.request_id)
      || !isObject(body.fields) || !isObject(body.labels)) {
    throw new ContractError('invalid_request')
  }
  const fieldKeys = Object.keys(body.fields)
  if (fieldKeys.length < 1 || fieldKeys.length > 200) throw new ContractError('invalid_request')
  for (const key of fieldKeys) {
    const value = body.fields[key]
    if (!RE.fieldKey.test(key)) throw new ContractError('invalid_request')
    if (typeof value === 'string') {
      if (cpLength(value) > 4000) throw new ContractError('invalid_request')
    } else if (Array.isArray(value)) {
      if (value.length > 50 || value.some((item) => !isText(item, 512))) throw new ContractError('invalid_request')
    } else {
      throw new ContractError('invalid_request')
    }
  }
  const labelKeys = Object.keys(body.labels)
  if (labelKeys.length > 400) throw new ContractError('invalid_request')
  for (const key of labelKeys) {
    if (!RE.fieldKey.test(key) || !isText(body.labels[key], 500)) throw new ContractError('invalid_request')
  }
  return body as unknown as FormOrderSubmission
}

export interface FormOrderMeta {
  sections?: Record<string, string>
  options?: Record<string, Record<string, string>>
}

/**
 * Meta opsional dari plugin versi baru: `field_sections` (nama step per field) & `option_labels` (teks tampilan opsi).
 * Hanya bagian yang valid yang disimpan; data meta yang rusak dibuang TANPA menolak order (order tidak boleh hilang).
 */
export function sanitizeFormOrderMeta(body: Json, fields: Record<string, unknown>): FormOrderMeta {
  const meta: FormOrderMeta = {}
  const short = (v: unknown, max: number) => (typeof v === 'string' && v.trim() !== '' && cpLength(v) <= max && !RE.control.test(v) ? v.trim() : null)
  if (isObject(body.field_sections)) {
    const sections: Record<string, string> = {}
    for (const [key, value] of Object.entries(body.field_sections).slice(0, 400)) {
      const title = short(value, 120)
      if (RE.fieldKey.test(key) && key in fields && title) sections[key] = title
    }
    if (Object.keys(sections).length) meta.sections = sections
  }
  if (isObject(body.option_labels)) {
    const options: Record<string, Record<string, string>> = {}
    for (const [key, map] of Object.entries(body.option_labels).slice(0, 200)) {
      if (!RE.fieldKey.test(key) || !(key in fields) || !isObject(map)) continue
      const clean: Record<string, string> = {}
      for (const [code, label] of Object.entries(map).slice(0, 50)) {
        const text = short(label, 200)
        if (cpLength(code) <= 512 && text) clean[code] = text
      }
      if (Object.keys(clean).length) options[key] = clean
    }
    if (Object.keys(options).length) meta.options = options
  }
  return meta
}

/** Pastikan respons stok mencakup tepat seluruh hadiah request (tanpa asing/duplikat/hilang). */
export function assertStockMatchesCatalog(stock: unknown, gifts: CatalogGift[]): asserts stock is Array<{
  gift_id: string; initial_quantity: number; available_quantity: number; availability: string
}> {
  if (!Array.isArray(stock) || stock.length !== gifts.length) throw new ContractError('script_error')
  const expected = new Map(gifts.map((g) => [g.gift_id, g]))
  const seen = new Set<string>()
  for (const row of stock) {
    const g = isObject(row) && typeof row.gift_id === 'string' ? expected.get(row.gift_id) : undefined
    if (!g || seen.has(g.gift_id) || row.initial_quantity !== g.initial_quantity
        || !isInt(row.available_quantity, 0, g.available_quantity)
        || row.availability !== ((row.available_quantity as number) > 0 ? 'available' : 'unavailable')) {
      throw new ContractError('script_error')
    }
    seen.add(g.gift_id)
  }
}
