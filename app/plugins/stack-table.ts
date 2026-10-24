// v-stack: di layar sempit tabel `.table-stack` ditampilkan sebagai kartu per baris (lihat main.css).
// Direktif ini menyalin judul kolom (thead) ke setiap sel sebagai data-label agar tiap nilai tetap berlabel.
function label(table: HTMLTableElement) {
  const heads = [...table.querySelectorAll(':scope > thead > tr > th')].map((th) => (th.textContent ?? '').trim())
  for (const row of table.querySelectorAll(':scope > tbody > tr')) {
    ;[...row.children].forEach((cell, i) => cell.setAttribute('data-label', heads[i] ?? ''))
  }
}

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.directive<HTMLTableElement>('stack', { mounted: label, updated: label })
})
