-- MDUNDIG: satu akun pelanggan = satu undangan.
-- - invitation_access: maksimal satu baris per akun.
-- - owner_mappings: maksimal satu pemetaan per akun.
-- - Akun tidak boleh memakai akses eksplisit dan pemetaan pemilik sekaligus.
-- Satu undangan tetap boleh dilihat beberapa akun (mis. mempelai pria & wanita masing-masing punya akun).

alter table public.invitation_access drop constraint if exists invitation_access_one_per_user;
alter table public.invitation_access add constraint invitation_access_one_per_user unique (user_id);

alter table public.owner_mappings drop constraint if exists owner_mappings_one_per_user;
alter table public.owner_mappings add constraint owner_mappings_one_per_user unique (user_id);

create or replace function private.guard_single_invitation_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'invitation_access'
     and exists (select 1 from public.owner_mappings m where m.user_id = new.user_id) then
    raise exception 'user_has_access' using errcode = '23505',
      hint = 'Akun ini sudah mendapat undangan lewat pemetaan otomatis.';
  end if;
  if tg_table_name = 'owner_mappings'
     and exists (select 1 from public.invitation_access a where a.user_id = new.user_id) then
    raise exception 'user_has_access' using errcode = '23505',
      hint = 'Akun ini sudah punya akses ke satu undangan.';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_single_invitation_access() from public, anon, authenticated;

drop trigger if exists invitation_access_single on public.invitation_access;
create trigger invitation_access_single before insert or update of user_id on public.invitation_access
  for each row execute function private.guard_single_invitation_access();
drop trigger if exists owner_mappings_single on public.owner_mappings;
create trigger owner_mappings_single before insert or update of user_id on public.owner_mappings
  for each row execute function private.guard_single_invitation_access();
