<script setup lang="ts">
import { Copy } from 'lucide-vue-next'
import { formatWhatsapp, normalizeWhatsapp, whatsappLink } from '../../shared/whatsapp'

// Kirim pesan bebas lewat WhatsApp: nomor tujuan, pesan yang bisa disunting, tombol Salin & Kirim (menempel di bawah popup).
const props = defineProps<{ whatsapp: string | null }>()
const message = defineModel<string>({ required: true })
const emit = defineEmits<{ sent: [phone: string] }>()
const toast = useToast()
const phoneInput = ref(formatWhatsapp(props.whatsapp))
const phone = computed(() => normalizeWhatsapp(phoneInput.value))
const link = computed(() => (phone.value && message.value.trim() ? whatsappLink(phone.value, message.value) : ''))
const sent = ref(false)

function onSend(event: MouseEvent) {
  if (!link.value || !phone.value) { event.preventDefault(); return }
  sent.value = true
  emit('sent', phone.value)
}
async function copy() {
  try {
    await navigator.clipboard.writeText(message.value)
    toast.success('Pesan disalin.')
  } catch {
    toast.error('Pesan gagal disalin. Pilih teks lalu salin manual.')
  }
}
</script>

<template>
  <div class="wa" data-testid="wa-composer">
    <div class="field">
      <label for="wc-phone" class="field-label">Kirim ke WhatsApp</label>
      <input id="wc-phone" v-model="phoneInput" class="input" inputmode="tel" autocomplete="off" placeholder="0812-3456-7890">
      <p v-if="phoneInput && !phone" class="field-hint err" role="alert">Nomor WhatsApp tidak valid.</p>
      <p v-else-if="!phoneInput" class="field-hint">Isi nomor WhatsApp aktif pelanggan.</p>
    </div>
    <div class="field">
      <label for="wc-message" class="field-label">Pesan <span class="text-caption">(bisa disunting sebelum dikirim)</span></label>
      <textarea id="wc-message" v-model="message" class="textarea mono-ish" rows="10" />
    </div>
    <div class="wa-actions">
      <p class="sent-note text-caption"><span class="dot" :class="{ on: !sent }" aria-hidden="true" />{{ sent ? 'WhatsApp dibuka' : 'Belum dikirim' }}</p>
      <button class="btn btn-secondary" type="button" @click="copy"><Copy :size="16" /> Salin pesan</button>
      <a class="btn" :class="[sent ? 'btn-secondary' : 'btn-primary', { disabled: !link }]" :href="link || undefined" :aria-disabled="!link"
        target="_blank" rel="noopener noreferrer" data-testid="wc-send" @click="onSend">
        <WhatsAppIcon :size="16" /> {{ sent ? 'Kirim ulang' : 'Kirim lewat WhatsApp' }}
      </a>
    </div>
  </div>
</template>

<style scoped>
.wa { display: flex; flex-direction: column; gap: 1rem; }
.mono-ish { font-size: var(--fs-label); line-height: 1.55; white-space: pre-wrap; }
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
