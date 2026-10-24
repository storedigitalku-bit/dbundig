<script setup lang="ts">
import { Copy, TriangleAlert } from 'lucide-vue-next'
import { resolveAppBase } from '../../shared/appUrl'
import { buildAccessMessage, formatWhatsapp, normalizeWhatsapp, whatsappLink } from '../../shared/whatsapp'

// Kirim akses akun ke pelanggan lewat WhatsApp: pesan rapi siap kirim (bisa disunting), tombol buka WhatsApp & salin.
// Password tidak disimpan sistem: `password` terisi tepat setelah akun dibuat / password diatur ulang. Bila null
// (kirim ulang dari tabel akun), admin boleh mengisi password baru — password akun diganti saat pesan dikirim (`beforeSend`).
const props = defineProps<{
  name: string; username: string; password: string | null; whatsapp: string | null
  invitationTitle?: string | null; sender?: string | null; sentAt?: string | null
  beforeSend?: (input: { phone: string; password: string | null }) => Promise<void>
}>()
const emit = defineEmits<{ sent: [phone: string] }>()
const toast = useToast()
const config = useRuntimeConfig()
const phoneInput = ref(formatWhatsapp(props.whatsapp))
const phone = computed(() => normalizeWhatsapp(phoneInput.value))
const newPassword = ref('')
const passwordProblem = computed(() => (props.password === null && newPassword.value ? passwordError(newPassword.value) : ''))
const effectivePassword = computed(() => props.password ?? (newPassword.value || null))
const loginUrl = computed(() => {
  const base = resolveAppBase(config.public.appUrl, window.location.origin).base
  return `${base}/login?u=${encodeURIComponent(props.username)}`
})
const message = ref('')
// Template buatan admin (menu Pesan WhatsApp); bawaan bila belum diatur.
const { templates, load: loadTemplates } = useWaTemplates()
void loadTemplates()
watchEffect(() => {
  message.value = buildAccessMessage({
    name: props.name, username: props.username, password: effectivePassword.value, loginUrl: loginUrl.value,
    invitationTitle: props.invitationTitle, sender: props.sender,
  }, templates.value.access)
})
const link = computed(() => (phone.value && !passwordProblem.value ? whatsappLink(phone.value, message.value) : ''))
const sentAt = ref<string | null>(props.sentAt ?? null)
const sending = ref(false)

async function send(event: MouseEvent) {
  if (!link.value || !phone.value || sending.value) { event.preventDefault(); return }
  const target = phone.value
  const url = link.value
  const needsPrepare = !!props.beforeSend && props.password === null && !!newPassword.value
  if (!needsPrepare) {
    // Tautan dibuka langsung oleh <a target="_blank">.
    sentAt.value = new Date().toISOString()
    emit('sent', target)
    return
  }
  // Password baru disimpan dulu; jendela dibuka sinkron agar tidak diblokir browser, lalu diarahkan ke WhatsApp.
  event.preventDefault()
  const win = window.open('', '_blank')
  if (win) win.opener = null
  sending.value = true
  try {
    await props.beforeSend!({ phone: target, password: newPassword.value })
    if (win) win.location.href = url
    else window.open(url, '_blank', 'noopener')
    sentAt.value = new Date().toISOString()
    emit('sent', target)
  } catch (err) {
    win?.close()
    toast.error(errorMessage(err, 'Password baru gagal disimpan. Pesan belum dikirim.'))
  } finally {
    sending.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(message.value)
    toast.success('Pesan disalin.')
  } catch {
    const area = document.createElement('textarea')
    area.value = message.value
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    if (ok) toast.success('Pesan disalin.')
    else toast.error('Pesan gagal disalin. Pilih teks lalu salin manual.')
  }
}
</script>

<template>
  <div class="wa" data-testid="wa-panel">
    <p v-if="password !== null" class="alert"><TriangleAlert :size="16" /> <span>Password hanya tampil sekarang dan tidak disimpan di sistem. Kirim atau salin pesan ini sebelum menutup.</span></p>
    <div class="grid gap-4" :class="{ 'sm:grid-cols-2': password === null }">
      <div class="field">
        <label for="wa-phone" class="field-label">Kirim ke WhatsApp</label>
        <input id="wa-phone" v-model="phoneInput" class="input" inputmode="tel" autocomplete="off" placeholder="0812-3456-7890">
        <p v-if="phoneInput && !phone" class="field-hint err" role="alert">Nomor WhatsApp tidak valid.</p>
        <p v-else-if="!phoneInput" class="field-hint">Isi nomor WhatsApp aktif pelanggan.</p>
      </div>
      <div v-if="password === null" class="field">
        <label for="wa-password" class="field-label">Password baru <span class="text-caption">(opsional)</span></label>
        <input id="wa-password" v-model="newPassword" class="input" type="text" autocomplete="new-password" autocapitalize="none" spellcheck="false">
        <p v-if="passwordProblem" class="field-hint err" role="alert">{{ passwordProblem }}</p>
        <p v-else class="field-hint">{{ newPassword ? 'Password akun diganti saat pesan dikirim.' : 'Kosongkan bila pelanggan tetap memakai password lama.' }}</p>
      </div>
    </div>
    <div class="field">
      <label for="wa-message" class="field-label">Pesan <span class="text-caption">(bisa disunting sebelum dikirim)</span></label>
      <textarea id="wa-message" v-model="message" class="textarea mono-ish" rows="9" />
    </div>
    <div class="wa-actions">
      <p class="sent-note text-caption" data-testid="wa-status">
        <span class="dot" :class="{ on: !sentAt }" aria-hidden="true" />
        {{ sentAt ? `Terkirim ${formatDateTime(sentAt)}` : 'Belum dikirim' }}
      </p>
      <button class="btn btn-secondary" type="button" @click="copy"><Copy :size="16" /> Salin pesan</button>
      <a class="btn" :class="[sentAt ? 'btn-secondary' : 'btn-primary', { disabled: !link || sending }]" :href="link || undefined" :aria-disabled="!link || sending"
        target="_blank" rel="noopener noreferrer" data-testid="wa-send" @click="send">
        <WhatsAppIcon :size="16" /> {{ sending ? 'Menyiapkan…' : sentAt ? 'Kirim ulang' : 'Kirim lewat WhatsApp' }}
      </a>
    </div>
  </div>
</template>

<style scoped>
.wa { display: flex; flex-direction: column; gap: 1rem; }
.mono-ish { font-size: var(--fs-label); line-height: 1.55; white-space: pre-wrap; }
/* Tombol aksi menempel di bawah popup (gaya sama dengan footer modal) agar selalu terlihat, juga di ponsel. Tutup lewat tombol X. */
.wa-actions {
  position: sticky; bottom: -1.5rem; z-index: 1; margin: 0 -1.5rem -1.5rem; padding: 1rem 1.5rem;
  display: flex; align-items: center; justify-content: flex-end; gap: 0.75rem; flex-wrap: wrap;
  background: var(--bg-subtle); border-top: 1px solid var(--border);
}
.sent-note { margin-right: auto; display: inline-flex; align-items: center; gap: 0.4rem; }
.dot { width: 8px; height: 8px; border-radius: 999px; background: var(--n-300, #cbd5e1); }
.dot.on { background: var(--brand); }
.btn.disabled { pointer-events: none; opacity: 0.5; }
.err { color: var(--err); }
@media (max-width: 640px) {
  .wa-actions { bottom: -1.25rem; margin: 0 -1.25rem -1.25rem; padding: 1rem 1.25rem; flex-direction: column-reverse; align-items: stretch; }
  .wa-actions > .btn { width: 100%; }
  .sent-note { margin-right: 0; justify-content: center; }
}
</style>
