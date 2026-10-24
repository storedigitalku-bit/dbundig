<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'

// Langkah kedua login untuk akun yang mengaktifkan verifikasi dua langkah (kode 6 digit dari aplikasi authenticator).
definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Verifikasi dua langkah — MDUNDIG' })

const auth = useAuth()
const route = useRoute()
const code = ref('')
const loading = ref(false)
const error = ref('')
const clean = computed(() => code.value.replace(/\D/g, '').slice(0, 6))

async function submit() {
  if (loading.value || clean.value.length !== 6) return
  loading.value = true
  error.value = ''
  try {
    await auth.verifyMfa(clean.value)
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') && !route.query.next.startsWith('//') ? route.query.next : '/'
    await navigateTo(next)
  } catch (err) {
    const msg = (err as { message?: string }).message ?? ''
    error.value = /invalid|expired|code/i.test(msg) ? 'Kode salah atau sudah kedaluwarsa. Masukkan kode terbaru dari aplikasi authenticator.' : (msg || 'Verifikasi gagal. Coba lagi.')
    code.value = ''
  } finally {
    loading.value = false
  }
}
async function logout() {
  await auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div>
    <div class="mb-7">
      <span class="badge-icon" aria-hidden="true"><ShieldCheck :size="22" /></span>
      <h1 class="mb-2">Verifikasi dua langkah</h1>
      <p class="text-caption">Buka aplikasi authenticator (Google Authenticator, Microsoft Authenticator, dll.) lalu masukkan kode 6 digit untuk MDUNDIG.</p>
    </div>
    <form class="flex flex-col gap-5" novalidate @submit.prevent="submit">
      <div class="field">
        <label class="field-label" for="mfa-code">Kode verifikasi</label>
        <input id="mfa-code" v-model="code" class="input code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456" required>
      </div>
      <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
      <AsyncButton type="submit" :loading="loading" size="lg" block :disabled="clean.length !== 6">Verifikasi</AsyncButton>
    </form>
    <p class="mt-6 text-center text-caption">Bukan Anda atau tidak memegang ponselnya? <button class="link" type="button" @click="logout">Keluar</button></p>
  </div>
</template>

<style scoped>
.badge-icon { display: inline-grid; place-items: center; width: 44px; height: 44px; margin-bottom: 0.9rem; border-radius: var(--r); color: var(--brand); background: color-mix(in srgb, var(--brand) 10%, transparent); }
.code { font-size: 1.25rem; letter-spacing: 0.35em; text-align: center; font-variant-numeric: tabular-nums; }
.link { color: var(--brand); font-weight: var(--fw-medium); background: none; border: 0; padding: 0; cursor: pointer; font: inherit; }
.link:hover { color: var(--brand-hover); }
</style>
