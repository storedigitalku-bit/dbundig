// POST /api/daftar-hadiah — kontrak registry-api-v1 (semua operation melalui field `operation`).
export default defineEventHandler((event) => integrationRoute(event, 'daftar_hadiah'))
