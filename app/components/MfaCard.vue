<script setup lang="ts">
import { ShieldCheck } from 'lucide-vue-next'

// Verifikasi dua langkah (TOTP, Supabase MFA). Setelah aktif, server menolak semua API sampai kode authenticator
// dimasukkan saat login (sesi aal2).
interface Factor { id: string; status: string; created_at?: string }
const auth = useAuth()
const toast = useToast()
const loading = ref(true)
const factor = ref<Factor | null>(null)
const enrolling = ref<{ id: string; qr: string; secret: string } | null>(null)
const code = ref('')
const busy = ref(false)
const error = ref('')
const disableOpen = ref(false)
const supabase = useSupabase()

async function refresh() {
  loading.value = true
  try {
    const { data, error: err } = await supabase.auth.mfa.listFactors()
    if (err) throw err
    factor.value = (data.totp as Factor[]).find((f) => f.status === 'verified') ?? null
  } catch {
    factor.value = null
  } finally {
    loading.value = false
  }
}
onMounted(refresh)

async function start() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    // Bersihkan pendaftaran lama yang belum selesai.
    const { data: list } = await supabase.auth.mfa.listFactors()
    for (const f of (list?.all ?? []) as Factor[]) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `MDUNDIG ${new Date().toISOString().slice(0, 10)}` })
    if (err || !data) throw err ?? new Error('enroll_failed')
    enrolling.value = { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret }
    code.value = ''
  } catch (err) {
    error.value = /not enabled|disabled/i.test((err as Error)?.message ?? '')
      ? 'Verifikasi dua langkah belum diaktifkan di Supabase (Authentication → Multi-Factor → TOTP).'
      : 'Gagal memulai verifikasi dua langkah. Coba lagi.'
  } finally {
    busy.value = false
  }
}
async function confirm() {
  const clean = code.value.replace(/\D/g, '')
  if (!enrolling.value || busy.value || clean.length !== 6) return
  busy.value = true
  error.value = ''
  try {
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.value.id, code: clean })
    if (err) throw err
    auth.session.value = (await supabase.auth.getSession()).data.session
    enrolling.value = null
    toast.success('Verifikasi dua langkah aktif. Saat login berikutnya, masukkan kode dari aplikasi authenticator.')
    await refresh()
  } catch {
    error.value = 'Kode salah atau kedaluwarsa. Masukkan kode terbaru dari aplikasi authenticator.'
  } finally {
    busy.value = false
  }
}
async function cancel() {
  const id = enrolling.value?.id
  enrolling.value = null
  error.value = ''
  if (id) await supabase.auth.mfa.unenroll({ factorId: id }).catch(() => {})
}
async function disable() {
  if (!factor.value || busy.value) return
  busy.value = true
  try {
    const { error: err } = await supabase.auth.mfa.unenroll({ factorId: factor.value.id })
    if (err) throw err
    disableOpen.value = false
    toast.success('Verifikasi dua langkah dinonaktifkan.')
    await refresh()
  } catch {
    toast.error('Gagal menonaktifkan. Masuk ulang dengan kode verifikasi, lalu coba lagi.')
  } finally {
    busy.value = false
  }
}
async function copySecret() {
  try { await navigator.clipboard.writeText(enrolling.value?.secret ?? ''); toast.success('Kode rahasia disalin.') } catch { toast.error('Gagal menyalin.') }
}
</script>

<template>
  <section class="card form-card" aria-labelledby="mfa-title" data-testid="mfa-card">
    <div class="card-header">
      <div>
        <h2 id="mfa-title" class="flex items-center gap-2"><ShieldCheck :size="18" /> Verifikasi dua langkah</h2>
        <p class="text-caption">Login admin memerlukan kode dari aplikasi authenticator di ponsel</p>
      </div>
      <span v-if="!loading" class="badge" :class="factor ? 'tone-ok badge-dot' : ''">{{ factor ? 'Aktif' : 'Nonaktif' }}</span>
    </div>
    <div class="card-body flex flex-col gap-4">
      <LoadingRows v-if="loading" :rows="2" />
      <template v-else-if="enrolling">
        <ol class="steps-list">
          <li>Pasang aplikasi authenticator (Google Authenticator, Microsoft Authenticator, dll.).</li>
          <li>Pindai kode QR ini, atau masukkan kode rahasia secara manual.</li>
          <li>Masukkan kode 6 digit yang muncul di aplikasi.</li>
        </ol>
        <div class="qr-row">
          <img :src="enrolling.qr" alt="Kode QR verifikasi dua langkah" class="qr" width="168" height="168">
          <div class="min-w-0">
            <p class="text-caption">Kode rahasia</p>
            <p class="secret text-mono">{{ enrolling.secret }}</p>
            <button class="btn btn-ghost btn-sm" type="button" @click="copySecret">Salin kode rahasia</button>
          </div>
        </div>
        <form class="flex flex-col gap-3" novalidate @submit.prevent="confirm">
          <div class="field">
            <label for="mfa-new-code" class="field-label">Kode 6 digit</label>
            <input id="mfa-new-code" v-model="code" class="input code" inputmode="numeric" autocomplete="one-time-code" maxlength="7" placeholder="123456">
          </div>
          <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
          <div class="flex gap-2 justify-end">
            <button class="btn btn-secondary" type="button" :disabled="busy" @click="cancel">Batal</button>
            <AsyncButton type="submit" :loading="busy" :disabled="code.replace(/\D/g, '').length !== 6">Aktifkan</AsyncButton>
          </div>
        </form>
      </template>
      <template v-else>
        <p class="text-caption">{{ factor ? 'Akun ini terlindungi: password saja tidak cukup untuk masuk.' : 'Disarankan untuk akun admin. Walau password bocor, akun tetap tidak bisa dimasuki tanpa ponsel Anda.' }}</p>
        <p v-if="error" class="alert tone-err" role="alert">{{ error }}</p>
        <div class="flex justify-end">
          <button v-if="factor" class="btn btn-danger-ghost" type="button" @click="disableOpen = true">Nonaktifkan</button>
          <AsyncButton v-else :loading="busy" @click="start"><ShieldCheck :size="16" /> Aktifkan verifikasi dua langkah</AsyncButton>
        </div>
      </template>
    </div>
    <ConfirmDialog :open="disableOpen" title="Nonaktifkan verifikasi dua langkah?" message="Login hanya memerlukan password lagi. Anda bisa mengaktifkannya kembali kapan saja."
      confirm-label="Nonaktifkan" :loading="busy" @close="disableOpen = false" @confirm="disable" />
  </section>
</template>

<style scoped>
.form-card { display: flex; flex-direction: column; }
.steps-list { margin: 0; padding-left: 1.1rem; font-size: var(--fs-label); color: var(--text-body); display: flex; flex-direction: column; gap: 0.25rem; }
.qr-row { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; }
.qr { width: 168px; height: 168px; padding: 8px; border: 1px solid var(--border); border-radius: var(--r); background: #fff; }
.secret { font-size: var(--fs-label); color: var(--text-heading); overflow-wrap: anywhere; margin: 0.15rem 0 0.35rem; }
.code { font-size: 1.15rem; letter-spacing: 0.3em; text-align: center; font-variant-numeric: tabular-nums; max-width: 220px; }
</style>
