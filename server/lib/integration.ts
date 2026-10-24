/**
 * Handler integrasi plugin (murni, dapat diuji tanpa Nuxt).
 * POST /api/daftar-hadiah  → registry-api-v1
 * POST /api/form-order     → form-order-api-v1
 */
import { createHmac } from 'node:crypto'
import {
  ContractError, DB_ERROR_CODES, DH_OPERATIONS, DH_SERVICE, DH_VERSION, ERROR_STATUS, FO_OPERATIONS, FO_SERVICE, FO_VERSION,
  RE, assertStockMatchesCatalog, echoFields, isObject, normalizeSiteUrl, validateCatalog, validateEnvelope,
  validateFormOrderEnvelope, validateFormOrderSubmission, sanitizeFormOrderMeta, validateOffset, validateReserve,
} from './contract'

export interface RpcError { code?: string; message: string }
export type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: RpcError | null }>

export interface IntegrationDeps {
  rpc: Rpc | null
  tokenHashSecret: string
  rateLimitPerMinute: number
  log?: (entry: Record<string, unknown>) => void
}

export interface IntegrationRequest {
  method: string
  headers: Record<string, string | undefined>
  rawBody: string | undefined
}

export interface IntegrationResponse {
  status: number
  body: Record<string, unknown>
}

export const MAX_BODY_BYTES = { daftar_hadiah: 400_000, form_order: 600_000 } as const
export type Module = 'daftar_hadiah' | 'form_order'

export function hashToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token, 'utf8').digest('hex')
}

function envelope(module: Module, operation: string, correlationId: string, success: boolean, data: unknown, error: string | null) {
  return {
    service: module === 'daftar_hadiah' ? DH_SERVICE : FO_SERVICE,
    version: module === 'daftar_hadiah' ? DH_VERSION : FO_VERSION,
    schema_version: 1,
    operation,
    correlation_id: correlationId,
    success,
    data: success ? data : null,
    error: success ? null : error,
  }
}

function fail(module: Module, echo: { operation: string; correlation_id: string }, code: string, status?: number): IntegrationResponse {
  return { status: status ?? ERROR_STATUS[code] ?? 500, body: envelope(module, echo.operation, echo.correlation_id, false, null, code) }
}

function mapDbError(error: RpcError): string {
  if (DB_ERROR_CODES.has(error.message)) return error.message
  if (error.code === '55P03' || error.code === '40P01' || error.code === '40001' || error.code === '57014') return 'busy'
  return 'script_error'
}

async function call(deps: IntegrationDeps, fn: string, args: Record<string, unknown>): Promise<unknown> {
  if (!deps.rpc) throw new ContractError('not_initialized')
  let result
  try {
    result = await deps.rpc(fn, args)
  } catch {
    // Jaringan/timeout ke database: sementara, aman untuk dicoba ulang.
    throw new ContractError('busy')
  }
  if (result.error) throw new ContractError(mapDbError(result.error))
  return result.data
}

export async function handleIntegration(module: Module, req: IntegrationRequest, deps: IntegrationDeps): Promise<IntegrationResponse> {
  const started = performance.now()
  let echo = { operation: '', correlation_id: '' }
  let response: IntegrationResponse
  try {
    response = await process(module, req, deps, (e) => { echo = e })
  } catch (err) {
    const code = err instanceof ContractError ? err.code : 'script_error'
    response = fail(module, echo, code)
  }
  deps.log?.({
    module, operation: echo.operation, correlation_id: echo.correlation_id, status: response.status,
    error: (response.body.error as string | null) ?? null, ms: Math.round(performance.now() - started),
  })
  return response
}

async function process(
  module: Module, req: IntegrationRequest, deps: IntegrationDeps, setEcho: (e: { operation: string; correlation_id: string }) => void,
): Promise<IntegrationResponse> {
  // GET dan metode lain tidak pernah menjadi pembaca data.
  if (req.method !== 'POST') return fail(module, { operation: '', correlation_id: '' }, 'method_not_allowed')
  const contentType = (req.headers['content-type'] ?? '').toLowerCase()
  if (!contentType.startsWith('application/json')) return fail(module, { operation: '', correlation_id: '' }, 'unsupported_media_type')
  const raw = req.rawBody ?? ''
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES[module]) return fail(module, { operation: '', correlation_id: '' }, 'payload_too_large')

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return fail(module, { operation: '', correlation_id: '' }, 'invalid_request', 400)
  }
  const echo = echoFields(body)
  setEcho(echo)

  // Token di header saja; tidak pernah di body/URL.
  const auth = RE.bearer.exec(req.headers.authorization ?? '')
  if (!auth) return fail(module, echo, 'unauthorized')
  if (isObject(body) && ('token' in body || 'secret' in body)) return fail(module, echo, 'invalid_request')

  const env = module === 'daftar_hadiah'
    ? validateEnvelope(body, DH_SERVICE, DH_OPERATIONS)
    : validateEnvelope(body, FO_SERVICE, FO_OPERATIONS)
  const json = body as Record<string, unknown>
  if (module === 'form_order') validateFormOrderEnvelope(json)

  if (!deps.tokenHashSecret || deps.tokenHashSecret.length < 32 || !deps.rpc) return fail(module, echo, 'not_initialized')

  const websiteUrl = normalizeSiteUrl(env.website_url) as string
  let authResult: unknown
  try {
    authResult = await call(deps, 'api_authenticate', {
      p_token_hash: hashToken(auth[1] as string, deps.tokenHashSecret),
      p_module: module,
      p_website_id: env.website_id,
      p_website_url: websiteUrl,
      p_rate_limit: deps.rateLimitPerMinute,
    })
  } catch (err) {
    // Database tidak dapat dihubungi/ belum dimigrasi → belum siap.
    if (err instanceof ContractError && err.code === 'script_error') return fail(module, echo, 'not_initialized')
    throw err
  }
  if (!isObject(authResult)) return fail(module, echo, 'not_initialized')
  if (authResult.ok !== true) {
    return fail(module, echo, String(authResult.error ?? 'forbidden'), Number(authResult.status) || undefined)
  }
  const website = String(authResult.website)
  const schemaReady = authResult.schema_version === '1'
  const ok = (data: unknown, status = 200): IntegrationResponse =>
    ({ status, body: envelope(module, env.operation, env.correlation_id, true, data, null) })

  if (module === 'form_order') {
    if (env.operation === 'ping') {
      if (!schemaReady || authResult.form_order_ready !== true) return fail(module, echo, 'not_initialized')
      return ok({ visibility: 'admin_only', storage_ready: true, scope: { website_id: env.website_id } })
    }
    const submission = validateFormOrderSubmission(json)
    const stored = await call(deps, 'api_form_order_submit', {
      p_website: website,
      p: {
        post_id: submission.post_id, post_title: submission.post_title, document_id: submission.document_id,
        element_id: submission.element_id, request_id: submission.request_id, fields: submission.fields, labels: submission.labels,
        meta: sanitizeFormOrderMeta(json, submission.fields),
      },
    })
    if (!isObject(stored) || typeof stored.order_id !== 'string' || typeof stored.timestamp !== 'string') {
      throw new ContractError('script_error')
    }
    // Receipt saja: tanpa fields atau data privat lain.
    return ok({
      visibility: 'admin_only',
      scope: { website_id: env.website_id, post_id: submission.post_id, document_id: submission.document_id, element_id: submission.element_id },
      status: 'stored',
      order_id: stored.order_id,
      request_id: submission.request_id,
      timestamp: stored.timestamp,
    }, stored.duplicate === true ? 200 : 201)
  }

  // ---- Daftar Hadiah
  if (env.operation === 'ping') {
    if (!schemaReady) return fail(module, echo, 'not_initialized')
    return ok({ backend_ready: true })
  }
  const catalog = validateCatalog(json)
  const scope = {
    website_id: env.website_id,
    invitation_id: catalog.invitation_id,
    registry_id: catalog.registry_id,
    owner_id: catalog.owner_id,
  }
  const payload = {
    website_id: env.website_id, invitation_id: catalog.invitation_id, invitation_title: catalog.invitation_title,
    registry_id: catalog.registry_id, document_id: catalog.document_id, element_id: catalog.element_id,
    catalog_version: catalog.catalog_version, catalog_hash: catalog.catalog_hash, owner_id: catalog.owner_id,
    gifts: catalog.gifts.map((g) => ({
      gift_id: g.gift_id, name: g.name, description: g.description, image_url: g.image_url, purchase_url: g.purchase_url,
      initial_quantity: g.initial_quantity, available_quantity: g.available_quantity, availability: g.availability,
    })),
  }

  if (env.operation === 'availability' || env.operation === 'sync_catalog') {
    const result = await call(deps, 'api_dh_catalog', { p_website: website, p: payload })
    const gifts = isObject(result) ? result.gifts : null
    assertStockMatchesCatalog(gifts, catalog.gifts)
    return ok({ scope, gifts })
  }

  if (env.operation === 'reserve') {
    const reserve = validateReserve(json)
    if (!catalog.gifts.some((g) => g.gift_id === reserve.gift_id)) throw new ContractError('gift_unavailable')
    const result = await call(deps, 'api_dh_reserve', {
      p_website: website,
      p: { ...payload, gift_id: reserve.gift_id, quantity: 1, request_id: reserve.request_id,
        guest: { name: reserve.guest.name, whatsapp: reserve.guest.whatsapp }, message: reserve.message },
    })
    if (!isObject(result) || result.status !== 'confirmed' || typeof result.reservation_id !== 'string'
        || typeof result.timestamp !== 'string' || !/Z$/.test(result.timestamp)) {
      throw new ContractError('script_error')
    }
    assertStockMatchesCatalog(result.gifts, catalog.gifts)
    return ok({
      scope,
      status: 'confirmed',
      reservation_id: result.reservation_id,
      gift_id: reserve.gift_id,
      quantity: 1,
      timestamp: result.timestamp,
      already_reserved: result.already_reserved === true,
      gifts: result.gifts,
    })
  }

  // reservations — dipanggil backend WordPress (admin), dibatasi website token + registry.
  const offset = validateOffset(json)
  const result = await call(deps, 'api_dh_reservations', {
    p_website: website,
    p: { invitation_id: catalog.invitation_id, registry_id: catalog.registry_id, offset },
  })
  if (!isObject(result) || !Array.isArray(result.reservations) || typeof result.total !== 'number') {
    throw new ContractError('script_error')
  }
  return ok({
    scope,
    reservations: result.reservations,
    total: result.total,
    next_offset: typeof result.next_offset === 'number' ? result.next_offset : null,
  })
}
