// Catat error server (status 5xx / exception tak tertangani) ke log error admin. Error 4xx (validasi, login, akses)
// adalah alur normal dan tidak dicatat.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error, { event }) => {
    const status = Number((error as { statusCode?: number }).statusCode) || 500
    if (status < 500) return
    const stack = typeof (error as Error).stack === 'string' ? (error as Error).stack!.split('\n').slice(0, 6).join('\n') : ''
    const task = logError({
      source: 'server', status, path: event?.path ?? '', message: (error as Error).message || 'Server error',
      detail: { stack: stack.slice(0, 1500), method: event?.method ?? null },
    }).catch(() => {})
    event?.waitUntil?.(task)
  })
})
