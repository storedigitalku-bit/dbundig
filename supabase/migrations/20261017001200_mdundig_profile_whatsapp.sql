-- MDUNDIG: nomor WhatsApp aktif pada akun (untuk mengirim akses akun ke pelanggan lewat WhatsApp).
-- Format sama dengan plugin: 62xxxxxxxxxx (8–15 digit, tanpa + / spasi). Wajib untuk akun pelanggan baru (dicek di API);
-- akun lama boleh kosong. Hanya pemilik akun & admin yang dapat membaca (RLS profiles yang sudah ada); diubah lewat server.
alter table public.profiles add column if not exists whatsapp text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_whatsapp_format') then
    alter table public.profiles add constraint profiles_whatsapp_format check (whatsapp is null or whatsapp ~ '^[1-9][0-9]{7,14}$');
  end if;
end $$;
