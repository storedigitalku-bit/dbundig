/**
 * Endpoint Web Push hanya boleh milik layanan push resmi browser (Chrome/Edge/Firefox/Safari/Windows). Server
 * mengirim permintaan ke endpoint ini, jadi alamat lain (mis. jaringan internal) ditolak untuk mencegah SSRF.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
]

export function validPushEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 1000) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null
    return PUSH_HOSTS.some((re) => re.test(url.hostname.toLowerCase())) ? url.toString() : null
  } catch {
    return null
  }
}

/** Kunci langganan dari PushSubscription.toJSON(): base64url, panjang wajar. */
export function validPushKey(value: unknown, max: number): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]+=*$/.test(value) && value.length >= 8 && value.length <= max ? value : null
}
