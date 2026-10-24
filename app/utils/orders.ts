export const ORDER_STATUS_LABEL: Record<string, string> = { baru: 'Baru', diproses: 'Diproses', selesai: 'Selesai', batal: 'Batal' }
export const ORDER_STATUSES = ['baru', 'diproses', 'selesai', 'batal'] as const
/** Titik status: biru = perlu ditangani (baru/diproses), abu-abu = selesai/batal. */
export const orderStatusTone = (s: string) => (s === 'baru' || s === 'diproses' ? 'tone-ok' : 'tone-neutral')
