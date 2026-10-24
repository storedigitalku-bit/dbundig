import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Tabel yang punya >1 relasi ke profiles (mis. user_id & granted_by/created_by) wajib menyebut nama FK saat embed
// (`profiles!<tabel>_user_id_fkey(...)`). Tanpa itu PostgREST menjawab 300 PGRST201 → "Terjadi kesalahan pada server".
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : []
  })
}

describe('embed PostgREST', () => {
  it('embed profiles di server selalu menyebut nama relasi', () => {
    const offenders: string[] = []
    for (const file of files('server')) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/\.select\(/.test(line) && /[\s,'`]profiles\(/.test(line)) offenders.push(`${file}:${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
  })
})
