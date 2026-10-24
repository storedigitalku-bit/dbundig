<script setup lang="ts">
import { Eye, EyeOff } from 'lucide-vue-next'

definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Masuk — MDUNDIG' })

const auth = useAuth()
const route = useRoute()
// Tautan masuk dari pesan akses WhatsApp membawa ?u=<username> agar kolom username langsung terisi.
const identifier = ref(typeof route.query.u === 'string' ? route.query.u.trim().slice(0, 120) : '')
const password = ref('')
const show = ref(false)
const loading = ref(false)
const error = ref('')
const notice = computed(() => (route.query.sesi === 'berakhir' ? 'Sesi Anda berakhir. Silakan masuk kembali.' : route.query.keluar === '1' ? 'Anda telah keluar.' : ''))
const configured = supabaseConfigured()

async function submit() {
  if (loading.value) return
  error.value = ''
  loading.value = true
  try {
    await auth.signIn(identifier.value.trim(), password.value)
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') && !route.query.next.startsWith('//') ? route.query.next : '/'
    await navigateTo(next)
  } catch (err) {
    error.value = errorMessage(err, 'Username/email atau password salah.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-7">
      <h1 class="mb-2">Masuk</h1>
      <p class="text-caption">Masuk dengan akun yang dibuat oleh admin.</p>
    </div>
    <div v-if="!configured" class="alert mb-5" role="alert">Konfigurasi Supabase pada server belum diisi.</div>
    <div v-if="notice" class="alert mb-5" role="status">{{ notice }}</div>
    <form class="flex flex-col gap-5" novalidate @submit.prevent="submit">
      <div class="field">
        <label class="field-label" for="identifier">Username atau email</label>
        <input id="identifier" v-model="identifier" class="input" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required>
      </div>
      <div class="field">
        <label class="field-label" for="password">Password</label>
        <div class="relative">
          <input id="password" v-model="password" class="input pr-11" :type="show ? 'text' : 'password'" autocomplete="current-password" required>
          <button type="button" class="pw-toggle" :aria-label="show ? 'Sembunyikan password' : 'Tampilkan password'" @click="show = !show">
            <component :is="show ? EyeOff : Eye" :size="17" />
          </button>
        </div>
      </div>
      <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
      <AsyncButton type="submit" :loading="loading" size="lg" block :disabled="!identifier || !password">Masuk</AsyncButton>
    </form>
    <p class="mt-6 text-center text-caption">Lupa password? Hubungi admin.</p>
  </div>
</template>

<style scoped>
.pw-toggle { position: absolute; top: 50%; right: 0.5rem; transform: translateY(-50%); display: grid; place-items: center; padding: 0.35rem; border-radius: var(--r-sm); color: var(--text-faint); background: none; border: 0; cursor: pointer; }
.pw-toggle:hover { color: var(--text-body); }
.link { color: var(--brand); font-weight: var(--fw-medium); }
.link:hover { color: var(--brand-hover); }
</style>
