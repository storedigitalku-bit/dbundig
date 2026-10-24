/**
 * CSV aman:
 * - Formula injection: nilai yang diawali = + - @ TAB CR diberi prefiks apostrof.
 * - Nomor telepon/rekening: deretan angka panjang atau diawali 0 diberi prefiks TAB
 *   agar spreadsheet membacanya sebagai teks (angka nol & digit tidak hilang).
 * - Separator titik koma (pemisah daftar Excel berbahasa Indonesia, sehingga kolom langsung terpisah rapi;
 *   Google Sheets/LibreOffice mendeteksinya otomatis), kutip ganda, CRLF, UTF-8 BOM (karakter Indonesia benar).
 */
export const CSV_SEPARATOR = ';'

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : Array.isArray(value) ? value.join(', ') : String(value)
  if (/^[=+\-@\t\r]/.test(text)) {
    text = "'" + text
  } else if (/^(?:0\d+|\+?\d{12,})$/.test(text)) {
    text = '\t' + text
  }
  return /[";,\r\n\t]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvCell).join(CSV_SEPARATOR), ...rows.map((row) => row.map(csvCell).join(CSV_SEPARATOR))]
  return '﻿' + lines.join('\r\n') + '\r\n'
}

/** Waktu lokal Indonesia Barat untuk laporan manusia. */
export function formatWib(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`
}
