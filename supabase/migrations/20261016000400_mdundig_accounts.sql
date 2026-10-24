-- MDUNDIG — akun dibuat langsung oleh admin (username + password), login dengan username.
-- Non-destruktif: menambah kolom & fungsi baru.

alter table public.profiles add column if not exists username text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,31}$');
  end if;
end $$;
create unique index if not exists profiles_username_uidx on public.profiles (username) where username is not null;

-- Profil otomatis: username diambil dari user_metadata.username (diisi server saat admin membuat akun).
create or replace function private.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(nullif(new.raw_user_meta_data ->> 'username', ''));
begin
  if v_username is not null and v_username !~ '^[a-z0-9][a-z0-9._-]{2,31}$' then
    v_username := null;
  end if;
  insert into public.profiles (id, email, display_name, username)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120), v_username)
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(public.profiles.username, excluded.username);
  return new;
end;
$$;
revoke all on function private.handle_auth_user() from public, anon, authenticated;

-- Pembatas percobaan login (per kunci, per menit) — dipakai server sebelum memanggil Supabase Auth.
create or replace function public.api_login_attempt(p_bucket text, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_hits integer;
  v_window timestamptz := date_trunc('minute', now());
begin
  if p_bucket !~ '^login:[a-f0-9]{64}$' then
    return false;
  end if;
  insert into public.rate_limits as rl (bucket, window_start, hits)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;
  delete from public.rate_limits where bucket = p_bucket and window_start < v_window - interval '10 minutes';
  return v_hits <= p_limit;
end;
$$;

-- Bootstrap admin: kini dapat menyimpan username (fungsi lama 1 argumen diganti).
drop function if exists public.bootstrap_platform_admin(text);
create or replace function public.bootstrap_platform_admin(p_email text, p_username text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_username text := lower(nullif(trim(p_username), ''));
begin
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'user_not_found: buat akun Auth terlebih dahulu';
  end if;
  insert into public.profiles (id, email) values (v_user, lower(trim(p_email))) on conflict (id) do nothing;
  if v_username is not null then
    update public.profiles set username = v_username where id = v_user;
  end if;
  insert into public.platform_admins (user_id, note) values (v_user, 'bootstrap') on conflict (user_id) do nothing;
  insert into public.access_audit (actor_id, action, target) values (null, 'admin.bootstrap', v_user::text);
  return v_user;
end;
$$;

revoke all on function public.api_login_attempt(text, integer) from public, anon, authenticated;
grant execute on function public.api_login_attempt(text, integer) to service_role;
revoke all on function public.bootstrap_platform_admin(text, text) from public, anon, authenticated;
grant execute on function public.bootstrap_platform_admin(text, text) to service_role;
