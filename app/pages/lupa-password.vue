<script setup lang="ts">
import { resolveAppBase } from '../../shared/appUrl'
definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Lupa password — MDUNDIG' })

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const error = ref('')

async function submit() {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const base = resolveAppBase(useRuntimeConfig().public.appUrl, window.location.origin).base
    const { error: err } = await useSupabase().auth.resetPasswordForEmail(email.value.trim(), { redirectTo: `${base.replace(/\/+$/, '')}/atur-password` })
    if (err && err.status === 429) throw err
    // Respons sama untuk email terdaftar/tidak, agar tidak membocorkan akun.
    sent.value = true
  } catch {
    error.value = 'Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-7">
      <h1 class="mb-2">Atur ulang password</h1>
      <p class="text-caption">Kami akan mengirim tautan untuk membuat password baru.</p>
    </div>
    <div v-if="sent" class="alert" role="status">Jika email terdaftar, tautan atur ulang password sudah dikirim. Periksa kotak masuk Anda.</div>
    <form v-else class="flex flex-col gap-5" @submit.prevent="submit">
      <div class="field">
        <label class="field-label" for="email">Email</label>
        <input id="email" v-model="email" class="input" type="email" autocomplete="email" required>
      </div>
      <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
      <AsyncButton type="submit" :loading="loading" size="lg" block :disabled="!email">Kirim tautan</AsyncButton>
    </form>
    <p class="mt-6 text-center text-caption"><NuxtLink to="/login" class="link">Kembali ke halaman masuk</NuxtLink></p>
  </div>
</template>

<style scoped>
.link { color: var(--brand); font-weight: var(--fw-medium); }
.link:hover { color: var(--brand-hover); }
</style>
