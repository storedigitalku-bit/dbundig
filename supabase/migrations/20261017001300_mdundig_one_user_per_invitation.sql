-- MDUNDIG: akses 1:1 — satu undangan hanya untuk satu akun pelanggan (melengkapi satu akun = satu undangan),
-- dan status kirim akses lewat WhatsApp per akun.
-- Migrasi ini TIDAK menghapus data: bila masih ada undangan yang dipegang >1 akun, migrasi berhenti dengan pesan jelas
-- sehingga admin memilih sendiri akun mana yang tetap memegang undangan tersebut.

do $$
begin
  if exists (select 1 from public.invitation_access group by invitation_id having count(*) > 1) then
    raise exception 'Masih ada undangan yang dipegang lebih dari satu akun. Cabut salah satunya dulu (Pengguna & Akses), lalu jalankan ulang migrasi ini.';
  end if;
end $$;

alter table public.invitation_access drop constraint if exists invitation_access_one_per_invitation;
alter table public.invitation_access add constraint invitation_access_one_per_invitation unique (invitation_id);

-- Akses eksplisit & pemetaan otomatis juga tidak boleh berebut undangan yang sama.
create or replace function private.guard_single_invitation_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'invitation_access' then
    if exists (select 1 from public.owner_mappings m where m.user_id = new.user_id) then
      raise exception 'user_has_access' using errcode = '23505',
        hint = 'Akun ini sudah mendapat undangan lewat pemetaan otomatis.';
    end if;
    if exists (
      select 1 from public.invitations i
      join public.owner_mappings m on m.website_id = i.website_id and m.external_owner_id = i.owner_external_id
      where i.id = new.invitation_id and m.user_id <> new.user_id
    ) then
      raise exception 'invitation_taken' using errcode = '23505',
        hint = 'Undangan ini sudah dipakai akun lain lewat pemetaan otomatis.';
    end if;
  end if;
  if tg_table_name = 'owner_mappings' then
    if exists (select 1 from public.invitation_access a where a.user_id = new.user_id) then
      raise exception 'user_has_access' using errcode = '23505',
        hint = 'Akun ini sudah punya akses ke satu undangan.';
    end if;
    if exists (
      select 1 from public.invitations i
      join public.invitation_access a on a.invitation_id = i.id
      where i.website_id = new.website_id and i.owner_external_id = new.external_owner_id and a.user_id <> new.user_id
    ) then
      raise exception 'invitation_taken' using errcode = '23505',
        hint = 'Undangan milik ID pemilik ini sudah dipakai akun lain.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_single_invitation_access() from public, anon, authenticated;

drop trigger if exists invitation_access_single on public.invitation_access;
create trigger invitation_access_single before insert or update of user_id, invitation_id on public.invitation_access
  for each row execute function private.guard_single_invitation_access();
drop trigger if exists owner_mappings_single on public.owner_mappings;
create trigger owner_mappings_single before insert or update of user_id, website_id, external_owner_id on public.owner_mappings
  for each row execute function private.guard_single_invitation_access();

-- Kapan akses akun terakhir dikirim lewat WhatsApp (null = belum dikirim / password diganti setelahnya).
alter table public.profiles add column if not exists whatsapp_sent_at timestamptz;
