// POST /api/form-order — kontrak form-order-api-v1 (ping & submit saja; tidak ada operasi baca).
export default defineEventHandler((event) => integrationRoute(event, 'form_order'))
