<script setup lang="ts">
// Tujuan tautan email undangan akun & reset password (Supabase Auth redirect URL).
definePageMeta({ layout: 'auth', public: true })
useHead({ title: 'Atur password — MDUNDIG' })

const auth = useAuth()
const password = ref('')
const confirm = ref('')
const loading = ref(false)
const error = ref('')
const done = ref(false)
const hasSession = computed(() => !!auth.session.value)

async function submit() {
  if (loading.value) return
  error.value = ''
  error.value = passwordError(password.value, confirm.value)
  if (error.value) return
  loading.value = true
  try {
    const { error: err } = await useSupabase().auth.updateUser({ password: password.value })
    if (err) throw err
    done.value = true
    useToast().success('Password berhasil disimpan.')
    await auth.loadMe()
    setTimeout(() => navigateTo('/'), 800)
  } catch {
    error.value = 'Password gagal disimpan. Tautan mungkin sudah kedaluwarsa; minta tautan baru.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-7">
      <h1 class="mb-2">Buat password</h1>
      <p class="text-caption">{{ PASSWORD_RULE }}</p>
    </div>
    <div v-if="!hasSession" class="alert" role="alert">
      Tautan tidak valid atau sudah kedaluwarsa. <NuxtLink to="/lupa-password" class="link">Minta tautan baru</NuxtLink>.
    </div>
    <div v-else-if="done" class="alert" role="status">Password tersimpan. Mengalihkan…</div>
    <form v-else class="flex flex-col gap-5" novalidate @submit.prevent="submit">
      <div class="field">
        <label class="field-label" for="pw">Password baru</label>
        <input id="pw" v-model="password" class="input" type="password" autocomplete="new-password" minlength="8" required>
      </div>
      <div class="field">
        <label class="field-label" for="pw2">Ulangi password</label>
        <input id="pw2" v-model="confirm" class="input" type="password" autocomplete="new-password" minlength="8" required>
      </div>
      <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
      <AsyncButton type="submit" :loading="loading" size="lg" block>Simpan password</AsyncButton>
    </form>
  </div>
</template>

<style scoped>
.link { color: var(--brand); font-weight: var(--fw-medium); }
</style>
