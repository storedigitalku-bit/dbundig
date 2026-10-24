// Guard UI. Otorisasi sesungguhnya tetap di server (requireUser/requireAdmin) dan RLS database.
export default defineNuxtRouteMiddleware(async (to) => {
  const auth = useAuth()
  await auth.init()
  const isPublic = to.meta.public === true
  if (!auth.session.value) {
    if (isPublic && to.path !== '/verifikasi') return
    return navigateTo({ path: '/login', query: to.fullPath !== '/' && to.path !== '/verifikasi' ? { next: to.fullPath } : {} })
  }
  if (!auth.me.value) await auth.loadMe()
  // Verifikasi dua langkah belum dilakukan: semua halaman menunggu kode authenticator.
  if (auth.mfaPending.value) return to.path === '/verifikasi' ? undefined : navigateTo({ path: '/verifikasi', query: to.path !== '/login' && to.fullPath !== '/' ? { next: to.fullPath } : {} })
  if (to.path === '/verifikasi' || to.path === '/login') return navigateTo('/')
  if (to.meta.admin === true && auth.me.value?.role !== 'admin') return navigateTo('/tidak-berhak')
})
