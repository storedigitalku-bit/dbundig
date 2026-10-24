import { normalizeSiteUrl } from '../../../../lib/contract'
import { hostOf } from '../../../../../shared/appUrl'

// Perubahan binding domain selalu eksplisit (reset_binding). Data undangan tidak dipindahkan.
export default defineEventHandler(async (event) => {
  const user = await requireAdmin(event)
  const id = uuidParam(getRouterParam(event, 'id'))
  const body = await readJson(event)
  const patch: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 120) throw badRequest('Nama website wajib diisi (maksimal 120 karakter).')
    patch.name = name
  }
  if (body.site_url !== undefined) {
    const siteUrl = typeof body.site_url === 'string' ? normalizeSiteUrl(body.site_url) : null
    if (!siteUrl) throw badRequest('URL website tidak valid.')
    // Cegah salah isi: alamat aplikasi MDUNDIG sendiri bukan alamat website WordPress.
    const own = [hostOf(appBaseUrl(event)), getRequestURL(event, { xForwardedHost: true }).host.toLowerCase()]
    if (own.includes(hostOf(siteUrl))) {
      throw badRequest('Ini alamat aplikasi MDUNDIG, bukan website WordPress. Isi dengan alamat beranda WordPress yang memakai ApeironKit (mis. https://undangan-anda.com/).')
    }
    patch.site_url = siteUrl
  }
  if (body.status !== undefined) {
    if (body.status !== 'active' && body.status !== 'disabled') throw badRequest('Status tidak valid.')
    patch.status = body.status
  }
  if (body.reset_binding === true) {
    patch.external_site_id = null
    patch.bound_at = null
  }
  if (Object.keys(patch).length === 0) throw badRequest('Tidak ada perubahan.')
  const { data, error } = await user.db.from('websites').update(patch).eq('id', id)
    .select('id, name, site_url, external_site_id, bound_at, status, created_at, updated_at').maybeSingle()
  if (error) throw dbError(error)
  if (!data) throw notFound()
  await audit(user, 'website.update', id, { fields: Object.keys(patch) })
  return data
})
