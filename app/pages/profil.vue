<script setup lang="ts">
import { KeyRound, LogOut, UserRound } from 'lucide-vue-next'

useHead({ title: 'Profil — MDUNDIG' })
const auth = useAuth()
const api = useApi()
const toast = useToast()
const name = ref(auth.me.value?.display_name ?? '')
watch(() => auth.me.value?.display_name, (v) => { if (v !== undefined) name.value = v })
const saving = ref(false)
const pw = ref('')
const pw2 = ref('')
const pwSaving = ref(false)
const pwError = ref('')
const me = computed(() => auth.me.value)
const shownName = computed(() => me.value?.display_name || me.value?.username || 'Akun')
const roleLabel = computed(() => (auth.isAdmin.value ? 'Admin platform' : 'Pelanggan'))
async function logout() {
  await auth.signOut()
  await navigateTo('/login')
}

async function saveName() {
  if (saving.value) return
  saving.value = true
  try {
    await api.request('/api/app/me', { method: 'PATCH', body: { display_name: name.value } })
    await auth.loadMe()
    toast.success('Profil disimpan.')
  } catch (err) {
    toast.error(errorMessage(err, 'Profil gagal disimpan.'))
  } finally {
    saving.value = false
  }
}
async function savePassword() {
  if (pwSaving.value) return
  pwError.value = ''
  pwError.value = passwordError(pw.value, pw2.value)
  if (pwError.value) return
  pwSaving.value = true
  try {
    const { error } = await useSupabase().auth.updateUser({ password: pw.value })
    if (error) throw error
    pw.value = ''
    pw2.value = ''
    toast.success('Password diperbarui.')
  } catch {
    pwError.value = 'Password gagal diperbarui. Coba keluar lalu masuk kembali.'
  } finally {
    pwSaving.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="page-head"><div><h1>Profil</h1><p class="text-caption">Kelola data akun dan password Anda.</p></div></div>

    <!-- Ringkasan akun -->
    <section class="card identity" aria-label="Ringkasan akun">
      <FaceAvatar :seed="me?.id || me?.username || 'akun'" :name="shownName" :size="56" />
      <div class="min-w-0 flex-1">
        <p class="identity-name truncate">{{ shownName }}</p>
        <p class="text-caption truncate">{{ [me?.username ? `@${me.username}` : '', me?.email].filter(Boolean).join(' · ') || '—' }}</p>
      </div>
      <span class="badge">{{ roleLabel }}</span>
    </section>

    <div class="grid gap-4 lg:grid-cols-2">
      <section class="card form-card" aria-labelledby="acc-title">
        <div class="card-header">
          <div>
            <h2 id="acc-title" class="flex items-center gap-2"><UserRound :size="18" /> Data akun</h2>
            <p class="text-caption">Nama tampilan muncul di dashboard</p>
          </div>
        </div>
        <form class="form-body" @submit.prevent="saveName">
          <div class="card-body flex flex-col gap-5">
            <dl class="facts">
              <div><dt>Username</dt><dd class="text-mono">{{ me?.username || '—' }}</dd></div>
              <div><dt>Email</dt><dd class="break-all">{{ me?.email || '—' }}</dd></div>
              <div><dt>Peran</dt><dd>{{ roleLabel }}</dd></div>
            </dl>
            <div class="field">
              <label for="display-name" class="field-label">Nama tampilan</label>
              <input id="display-name" v-model="name" class="input" maxlength="120" autocomplete="name">
            </div>
          </div>
          <div class="form-foot"><AsyncButton type="submit" :loading="saving">Simpan</AsyncButton></div>
        </form>
      </section>

      <section class="card form-card" aria-labelledby="pw-title">
        <div class="card-header">
          <div>
            <h2 id="pw-title" class="flex items-center gap-2"><KeyRound :size="18" /> Ubah password</h2>
            <p class="text-caption">Gunakan password kuat yang tidak dipakai di tempat lain</p>
          </div>
        </div>
        <form class="form-body" novalidate @submit.prevent="savePassword">
          <div class="card-body flex flex-col gap-5">
            <div class="grid gap-5 sm:grid-cols-2">
              <div class="field"><label for="np" class="field-label">Password baru</label><input id="np" v-model="pw" class="input" type="password" autocomplete="new-password" minlength="8"></div>
              <div class="field"><label for="np2" class="field-label">Ulangi password</label><input id="np2" v-model="pw2" class="input" type="password" autocomplete="new-password"></div>
            </div>
            <p class="field-hint -mt-2">{{ PASSWORD_RULE }}</p>
            <p v-if="pwError" class="alert tone-err" role="alert">{{ pwError }}</p>
          </div>
          <div class="form-foot"><AsyncButton type="submit" :loading="pwSaving" :disabled="!pw">Perbarui password</AsyncButton></div>
        </form>
      </section>
    </div>
    <div class="grid gap-4" :class="{ 'lg:grid-cols-2': auth.isAdmin.value }">
      <MfaCard v-if="auth.isAdmin.value" />
      <PushCard />
    </div>
    <!-- Ponsel: tombol Keluar di Profil (pelanggan tidak memakai menu samping di ponsel). -->
    <button class="btn btn-secondary logout-phone" type="button" @click="logout"><LogOut :size="16" /> Keluar</button>
  </div>
</template>

<style scoped>
.logout-phone { display: none; }
@media (max-width: 767.98px) { .logout-phone { display: inline-flex; width: 100%; color: var(--err); } }
.identity { display: flex; align-items: center; gap: 1rem; padding: 1.1rem 1.25rem; }
.identity-name { font-size: var(--fs-h3); font-weight: var(--fw-medium); color: var(--text-heading); }
.form-card { display: flex; flex-direction: column; }
.form-body { flex: 1; display: flex; flex-direction: column; }
.form-body > .card-body { flex: 1; }
.form-foot { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.85rem 1.25rem; border-top: 1px solid var(--border); background: var(--bg-subtle); border-radius: 0 0 var(--r) var(--r); }
.facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin: 0; padding: 0.85rem 1rem; border: 1px solid var(--border); border-radius: var(--r); }
.facts dt { font-size: var(--fs-caption); color: var(--text-muted); }
.facts dd { margin: 2px 0 0; font-size: var(--fs-label); color: var(--text-heading); min-width: 0; }
@media (max-width: 560px) { .facts { grid-template-columns: 1fr; } }
</style>
