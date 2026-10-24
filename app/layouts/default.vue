<script setup lang="ts">
const open = ref(false)
const route = useRoute()
// Ponsel (< 768px): semua peran memakai menu bawah (tanpa burger). Admin: 4 menu utama + "Lainnya".
// Tablet & desktop tetap memakai menu samping.
const bottomNav = true
watch(() => route.fullPath, () => { open.value = false })
watch(open, (v) => { if (import.meta.client) document.body.style.overflow = v ? 'hidden' : '' })
onBeforeUnmount(() => { if (import.meta.client) document.body.style.overflow = '' })
</script>

<template>
  <div class="shell" :class="{ 'has-bnav': bottomNav }">
    <a href="#konten" class="skip-link">Lewati ke konten</a>
    <AppSidebar :open="open" @close="open = false" />
    <div class="shell-main">
      <AppTopBar :phone-burger="!bottomNav" @toggle="open = !open" />
      <div class="shell-scroll">
        <main id="konten" class="shell-content" tabindex="-1">
          <slot />
        </main>
        <AppFooter />
      </div>
      <MobileBottomNav v-if="bottomNav" />
    </div>
  </div>
</template>

<style scoped>
.shell { display: flex; min-height: 100dvh; background: var(--bg-page); }
.shell-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.shell-scroll { flex: 1; display: flex; flex-direction: column; width: 100%; max-width: var(--content-max); margin: 0 auto; padding: 1.5rem; min-width: 0; }
.shell-content { flex: 1; min-width: 0; }
.shell-content:focus { outline: none; }
.skip-link { position: absolute; left: -999px; top: 0.5rem; z-index: 999; padding: 0.5rem 0.75rem; background: var(--brand); color: #fff; border-radius: var(--r-sm); }
.skip-link:focus { left: 0.5rem; }
@media (max-width: 640px) { .shell-scroll { padding: 1rem; } }
/* Ruang untuk menu bawah agar konten & footer tidak tertutup. */
@media (max-width: 767.98px) { .has-bnav .shell-scroll { padding-bottom: calc(112px + env(safe-area-inset-bottom)); } }
@media (min-width: 1600px) { .shell-scroll { padding: 1.75rem 2rem; } }
</style>
