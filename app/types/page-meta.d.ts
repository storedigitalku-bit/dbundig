declare module '#app' {
  interface PageMeta {
    /** Halaman dapat dibuka tanpa login (login, lupa/atur password). */
    public?: boolean
    /** Khusus admin platform (guard UI; server & RLS tetap memeriksa). */
    admin?: boolean
  }
}

export {}
