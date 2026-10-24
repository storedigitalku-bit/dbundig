/** Aturan password akun dashboard — sama dengan validasi server (server/lib/accounts.ts). */
export const PASSWORD_RULE = 'Minimal 8 karakter, maksimal 72. Gunakan gabungan huruf dan angka agar tidak mudah ditebak.'

export function passwordError(value: string, confirm?: string): string {
  if (value.length < 8) return 'Password minimal 8 karakter.'
  if (new TextEncoder().encode(value).length > 72) return 'Password maksimal 72 karakter.'
  if (confirm !== undefined && value !== confirm) return 'Konfirmasi password tidak sama.'
  return ''
}
