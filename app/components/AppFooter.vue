<script setup lang="ts">
// Tahun dari jam perangkat → tidak perlu diperbarui manual (pola Apeiron-portal).
const year = new Date().getFullYear()
</script>

<template>
  <footer class="footer">
    <p class="footer-copy">&copy; {{ year }} MDUNDIG. Seluruh hak cipta dilindungi.</p>
    <p class="footer-meta">Manajemen Data Undangan Digital</p>
  </footer>
</template>

<style scoped>
.footer {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  padding-top: 1.25rem; margin-top: 1.5rem; border-top: 1px solid var(--border);
}
.footer-copy, .footer-meta { font-size: var(--fs-caption); color: var(--text-muted); }
@media (max-width: 640px) { .footer { justify-content: center; text-align: center; gap: 0.25rem; } }
</style>
