<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
  <div class="auth">
    <div class="auth-card card">
      <div class="auth-brand">
        <AppLogo :size="44" />
        <span class="auth-brand-text">
          <strong>MDUNDIG</strong>
          <small>Manajemen Data Undangan Digital</small>
        </span>
      </div>
      <slot />
    </div>
    <p class="auth-footer">&copy; {{ year }} MDUNDIG. Seluruh hak cipta dilindungi.</p>
  </div>
</template>

<style scoped>
.auth { min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.25rem; padding: 1.5rem 1rem; background: var(--bg-page); }
.auth-footer { font-size: var(--fs-caption); color: var(--text-muted); text-align: center; }
/* Field & tombol form auth satu tinggi: input membaca --h-control, tombol btn-lg membaca --h-control-lg. */
.auth-card { width: 100%; max-width: 420px; padding: 2rem; --h-control: var(--h-control-lg); }
.auth-brand { display: flex; align-items: center; gap: 0.85rem; margin-bottom: 1.75rem; padding-bottom: 1.25rem; border-bottom: 1px solid var(--border); }
.auth-brand-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.auth-brand strong { font-size: 1.0625rem; font-weight: var(--fw-medium); color: var(--text-heading); letter-spacing: 0.02em; }
.auth-brand small { font-size: var(--fs-caption); color: var(--text-muted); }
@media (max-width: 480px) { .auth-card { padding: 1.5rem 1.25rem; } }
</style>
