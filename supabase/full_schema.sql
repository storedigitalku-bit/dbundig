-- ============================================================================
-- MDUNDIG - FULL DATABASE SCHEMA (GABUNGAN SEMUA MIGRASI 000100 - 001600)
-- File ini siap dijalankan sekaligus di SQL Editor Supabase.
-- ============================================================================


-- ============================================================================
-- SECTION: 20261016000100_mdundig_core.sql
-- ============================================================================

-- MDUNDIG (Manajemen Data Undangan Digital) — skema inti "Daftar Hadiah".
-- Non-destruktif: hanya membuat objek baru. Tidak menghapus/mengubah objek lain.
-- Semua tabel memakai RLS. Penulisan data integrasi hanya lewat fungsi yang
-- dieksekusi role service_role (server Nuxt), bukan lewat publishable key.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Utilitas
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.iso_utc(p_ts timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

create table if not exists public.app_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
insert into public.app_meta (key, value) values ('schema_version', '1')
on conflict (key) do update set value = excluded.value, updated_at = now();

-- ---------------------------------------------------------------------------
-- Pengguna dashboard
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  display_name text not null default '' check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_email_idx on public.profiles (lower(email));

-- Admin platform. Tidak ada policy INSERT/UPDATE untuk authenticated,
-- sehingga signup biasa tidak pernah menjadi admin.
create table if not exists public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Website & Token Website
-- ---------------------------------------------------------------------------
create table if not exists public.websites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  -- URL normalisasi dari home_url('/'): skema+host huruf kecil, path diakhiri '/'.
  site_url text not null unique
    check (char_length(site_url) <= 2048 and site_url ~ '^https?://[^/?#[:space:][:upper:]]+/([^?#[:space:]]*/)?$'),
  -- website_id plugin: 'site-' + 32 hex. Diikat saat pemakaian pertama token yang valid.
  external_site_id text unique check (external_site_id ~ '^site-[a-f0-9]{32}$'),
  bound_at timestamptz,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_tokens (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 80),
  -- HMAC-SHA256(TOKEN_HASH_SECRET, token) dihitung di server; plaintext tidak disimpan.
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_hint text not null default '' check (char_length(token_hint) <= 16),
  scopes text[] not null default array['daftar_hadiah', 'form_order']
    check (cardinality(scopes) between 1 and 2 and scopes <@ array['daftar_hadiah', 'form_order']),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  replaced_by uuid references public.website_tokens (id) on delete set null
);
create index if not exists website_tokens_website_idx on public.website_tokens (website_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Kepemilikan & hak akses
-- ---------------------------------------------------------------------------
create table if not exists public.owner_mappings (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites (id) on delete cascade,
  external_owner_id text not null check (external_owner_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (website_id, external_owner_id)
);
create index if not exists owner_mappings_user_idx on public.owner_mappings (user_id);

-- ---------------------------------------------------------------------------
-- Undangan, registry, hadiah, reservasi
-- ---------------------------------------------------------------------------
create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites (id) on delete restrict,
  wp_post_id bigint not null check (wp_post_id > 0),
  title text not null default '' check (char_length(title) <= 1000),
  owner_external_id text check (owner_external_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (website_id, wp_post_id)
);
create index if not exists invitations_owner_idx on public.invitations (website_id, owner_external_id)
  where owner_external_id is not null;
create index if not exists invitations_updated_idx on public.invitations (updated_at desc, id desc);

create table if not exists public.invitation_access (
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (invitation_id, user_id)
);
create index if not exists invitation_access_user_idx on public.invitation_access (user_id);

create table if not exists public.registries (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  registry_key text not null check (registry_key ~ '^registry-[1-9][0-9]*-[A-Za-z0-9_-]{1,100}$'),
  document_id bigint not null check (document_id > 0),
  element_id text not null check (element_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  catalog_version bigint not null check (catalog_version >= 0),
  catalog_hash text not null check (catalog_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invitation_id, registry_key)
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.registries (id) on delete cascade,
  invitation_id uuid not null references public.invitations (id) on delete cascade,
  gift_key text not null check (gift_key ~ '^gift-[A-Za-z0-9_-]{1,100}$'),
  name text not null check (char_length(name) between 1 and 600),
  description text not null default '' check (char_length(description) <= 20000),
  image_url text not null default '' check (char_length(image_url) <= 2048),
  purchase_url text not null default '' check (char_length(purchase_url) <= 2048),
  initial_quantity integer not null check (initial_quantity between 0 and 1000000),
  -- kapasitas manual = available_quantity dari katalog WordPress
  capacity integer not null check (capacity >= 0 and capacity <= initial_quantity),
  manual_status text not null check (manual_status in ('available', 'unavailable')),
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registry_id, gift_key)
);
create index if not exists gifts_invitation_idx on public.gifts (invitation_id);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites (id) on delete restrict,
  invitation_id uuid not null references public.invitations (id) on delete restrict,
  registry_id uuid not null references public.registries (id) on delete restrict,
  gift_id uuid not null references public.gifts (id) on delete restrict,
  request_id text not null check (request_id ~ '^[a-f0-9]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  quantity integer not null check (quantity between 1 and 1000000),
  guest_id text not null check (guest_id ~ '^guest-[a-f0-9]{64}$'),
  guest_name text not null check (char_length(guest_name) between 1 and 100),
  guest_whatsapp text not null check (guest_whatsapp ~ '^[1-9][0-9]{7,14}$'),
  message text not null default '' check (char_length(message) <= 1000),
  gift_name text not null default '',
  invitation_title text not null default '',
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (website_id, request_id)
);
-- Satu nomor WhatsApp hanya satu reservasi confirmed per hadiah (scope undangan via gift_id).
create unique index if not exists reservations_guest_gift_uidx on public.reservations (gift_id, guest_id)
  where status = 'confirmed';
create index if not exists reservations_registry_created_idx on public.reservations (registry_id, created_at desc, id desc);
create index if not exists reservations_invitation_created_idx on public.reservations (invitation_id, created_at desc, id desc);
create index if not exists reservations_created_idx on public.reservations (created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- Form Order (admin_only)
-- ---------------------------------------------------------------------------
create table if not exists public.form_orders (
  id uuid primary key default gen_random_uuid(),
  website_id uuid not null references public.websites (id) on delete restrict,
  request_id text not null check (request_id ~ '^[a-f0-9]{64}$'),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  post_id bigint not null check (post_id > 0),
  post_title text not null default '' check (char_length(post_title) <= 1000),
  document_id bigint not null check (document_id > 0),
  element_id text not null check (element_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  labels jsonb not null check (jsonb_typeof(labels) = 'object'),
  search_text text generated always as (lower(post_title || ' ' || fields::text)) stored,
  created_at timestamptz not null default now(),
  unique (website_id, request_id)
);
create index if not exists form_orders_created_idx on public.form_orders (created_at desc, id desc);
create index if not exists form_orders_website_created_idx on public.form_orders (website_id, created_at desc, id desc);

-- ---------------------------------------------------------------------------
-- Rate limit (efektif lintas instance serverless) & audit akses
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create table if not exists public.access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (char_length(action) <= 64),
  target text not null default '' check (char_length(target) <= 200),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists access_audit_created_idx on public.access_audit (created_at desc);

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
drop trigger if exists websites_touch on public.websites;
create trigger websites_touch before update on public.websites for each row execute function private.touch_updated_at();
drop trigger if exists invitations_touch on public.invitations;
create trigger invitations_touch before update on public.invitations for each row execute function private.touch_updated_at();
drop trigger if exists registries_touch on public.registries;
create trigger registries_touch before update on public.registries for each row execute function private.touch_updated_at();
drop trigger if exists gifts_touch on public.gifts;
create trigger gifts_touch before update on public.gifts for each row execute function private.touch_updated_at();

-- Profil dibuat otomatis untuk setiap akun Auth (tanpa hak admin).
create or replace function private.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, coalesce(new.email, ''), left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120))
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function private.handle_auth_user() from public, anon, authenticated;

drop trigger if exists mdundig_on_auth_user on auth.users;
create trigger mdundig_on_auth_user
  after insert or update of email on auth.users
  for each row execute function private.handle_auth_user();

-- ---------------------------------------------------------------------------
-- Helper otorisasi (schema private tidak diekspos Data API)
-- ---------------------------------------------------------------------------
create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()));
$$;

-- Undangan yang boleh dilihat pengguna saat ini: akses eksplisit, atau
-- owner_external_id yang dipetakan ke akun ini pada website yang sama.
-- owner_external_id NULL tidak pernah cocok dengan pemetaan apa pun.
create or replace function private.my_invitation_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.invitation_id
    from public.invitation_access a
   where a.user_id = (select auth.uid())
  union
  select i.id
    from public.owner_mappings m
    join public.invitations i
      on i.website_id = m.website_id
     and i.owner_external_id = m.external_owner_id
   where m.user_id = (select auth.uid());
$$;

create or replace function private.my_website_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct i.website_id from public.invitations i where i.id in (select private.my_invitation_ids());
$$;

revoke all on function private.is_platform_admin() from public, anon;
revoke all on function private.my_invitation_ids() from public, anon;
revoke all on function private.my_website_ids() from public, anon;
grant execute on function private.is_platform_admin() to authenticated, service_role;
grant execute on function private.my_invitation_ids() to authenticated, service_role;
grant execute on function private.my_website_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Hak tabel (eksplisit). anon tidak memperoleh akses apa pun.
-- ---------------------------------------------------------------------------
revoke all on public.app_meta, public.profiles, public.platform_admins, public.websites, public.website_tokens,
  public.owner_mappings, public.invitations, public.invitation_access, public.registries, public.gifts,
  public.reservations, public.form_orders, public.rate_limits, public.access_audit
  from anon, authenticated, public;

grant all on public.app_meta, public.profiles, public.platform_admins, public.websites, public.website_tokens,
  public.owner_mappings, public.invitations, public.invitation_access, public.registries, public.gifts,
  public.reservations, public.form_orders, public.rate_limits, public.access_audit
  to service_role;
grant usage, select on sequence public.access_audit_id_seq to service_role, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.platform_admins to authenticated;
grant select, insert, delete on public.websites to authenticated;
grant update (name, site_url, status, external_site_id, bound_at) on public.websites to authenticated;
-- token_hash TIDAK dapat dibaca role authenticated.
grant select (id, website_id, label, token_hint, scopes, created_by, created_at, last_used_at, revoked_at, revoked_by, replaced_by)
  on public.website_tokens to authenticated;
grant insert (website_id, label, token_hash, token_hint, scopes, created_by) on public.website_tokens to authenticated;
grant update (label, revoked_at, revoked_by, replaced_by) on public.website_tokens to authenticated;
grant select, insert, delete on public.owner_mappings to authenticated;
grant select, insert, delete on public.invitation_access to authenticated;
grant select on public.invitations, public.registries, public.gifts, public.reservations to authenticated;
grant select on public.form_orders to authenticated; -- dibatasi RLS: hanya admin platform
grant select, insert on public.access_audit to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.app_meta enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.websites enable row level security;
alter table public.website_tokens enable row level security;
alter table public.owner_mappings enable row level security;
alter table public.invitations enable row level security;
alter table public.invitation_access enable row level security;
alter table public.registries enable row level security;
alter table public.gifts enable row level security;
alter table public.reservations enable row level security;
alter table public.form_orders enable row level security;
alter table public.rate_limits enable row level security;
alter table public.access_audit enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_platform_admin()));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));

drop policy if exists websites_select on public.websites;
create policy websites_select on public.websites for select to authenticated
  using ((select private.is_platform_admin()) or id in (select private.my_website_ids()));
drop policy if exists websites_admin_insert on public.websites;
create policy websites_admin_insert on public.websites for insert to authenticated
  with check ((select private.is_platform_admin()));
drop policy if exists websites_admin_update on public.websites;
create policy websites_admin_update on public.websites for update to authenticated
  using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));
drop policy if exists websites_admin_delete on public.websites;
create policy websites_admin_delete on public.websites for delete to authenticated
  using ((select private.is_platform_admin()));

drop policy if exists website_tokens_admin_select on public.website_tokens;
create policy website_tokens_admin_select on public.website_tokens for select to authenticated
  using ((select private.is_platform_admin()));
drop policy if exists website_tokens_admin_insert on public.website_tokens;
create policy website_tokens_admin_insert on public.website_tokens for insert to authenticated
  with check ((select private.is_platform_admin()) and created_by = (select auth.uid()));
drop policy if exists website_tokens_admin_update on public.website_tokens;
create policy website_tokens_admin_update on public.website_tokens for update to authenticated
  using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));

drop policy if exists owner_mappings_admin on public.owner_mappings;
create policy owner_mappings_admin on public.owner_mappings for all to authenticated
  using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));

drop policy if exists invitation_access_select on public.invitation_access;
create policy invitation_access_select on public.invitation_access for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_platform_admin()));
drop policy if exists invitation_access_admin_insert on public.invitation_access;
create policy invitation_access_admin_insert on public.invitation_access for insert to authenticated
  with check ((select private.is_platform_admin()));
drop policy if exists invitation_access_admin_delete on public.invitation_access;
create policy invitation_access_admin_delete on public.invitation_access for delete to authenticated
  using ((select private.is_platform_admin()));

drop policy if exists invitations_select on public.invitations;
create policy invitations_select on public.invitations for select to authenticated
  using ((select private.is_platform_admin()) or id in (select private.my_invitation_ids()));
drop policy if exists registries_select on public.registries;
create policy registries_select on public.registries for select to authenticated
  using ((select private.is_platform_admin()) or invitation_id in (select private.my_invitation_ids()));
drop policy if exists gifts_select on public.gifts;
create policy gifts_select on public.gifts for select to authenticated
  using ((select private.is_platform_admin()) or invitation_id in (select private.my_invitation_ids()));
drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations for select to authenticated
  using ((select private.is_platform_admin()) or invitation_id in (select private.my_invitation_ids()));

-- Form Order: SELECT hanya admin platform. Tidak ada policy untuk pelanggan/anon.
drop policy if exists form_orders_admin_select on public.form_orders;
create policy form_orders_admin_select on public.form_orders for select to authenticated
  using ((select private.is_platform_admin()));

drop policy if exists access_audit_admin_select on public.access_audit;
create policy access_audit_admin_select on public.access_audit for select to authenticated
  using ((select private.is_platform_admin()));
drop policy if exists access_audit_admin_insert on public.access_audit;
create policy access_audit_admin_insert on public.access_audit for insert to authenticated
  with check ((select private.is_platform_admin()) and actor_id = (select auth.uid()));
-- app_meta & rate_limits: tanpa policy → hanya service_role.


-- ============================================================================
-- SECTION: 20261016000200_mdundig_integration.sql
-- ============================================================================

-- MDUNDIG — fungsi integrasi plugin ApeironKit (registry-api-v1 & form-order-api-v1).
-- Hanya service_role (server Nuxt) yang dapat mengeksekusi fungsi public.api_*.
-- Kode error dikirim sebagai pesan exception (mis. 'catalog_stale') dan
-- dipetakan ke kontrak plugin oleh server. Exception membatalkan seluruh transaksi.

-- ---------------------------------------------------------------------------
-- Autentikasi Token Website + binding website + rate limit
-- ---------------------------------------------------------------------------
create or replace function public.api_authenticate(
  p_token_hash text,
  p_module text,
  p_website_id text,
  p_website_url text,
  p_rate_limit integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_token record;
  v_hits integer;
  v_window timestamptz := date_trunc('minute', now());
begin
  if p_module not in ('daftar_hadiah', 'form_order')
     or p_token_hash !~ '^[a-f0-9]{64}$'
     or p_website_id !~ '^site-[a-f0-9]{32}$' then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'invalid_request');
  end if;

  select t.id as token_id, t.scopes, t.revoked_at, t.last_used_at,
         w.id as website_uuid, w.status, w.site_url, w.external_site_id
    into v_token
    from public.website_tokens t
    join public.websites w on w.id = t.website_id
   where t.token_hash = p_token_hash;

  if not found or v_token.revoked_at is not null then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'unauthorized');
  end if;
  if v_token.status <> 'active' or not (p_module = any (v_token.scopes)) then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden', 'reason', 'scope');
  end if;
  if v_token.site_url <> p_website_url then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden', 'reason', 'website_url');
  end if;

  if v_token.external_site_id is null then
    -- First-use binding: hanya setelah token valid dan URL cocok dengan website terdaftar.
    begin
      update public.websites
         set external_site_id = p_website_id, bound_at = now()
       where id = v_token.website_uuid and external_site_id is null;
    exception when unique_violation then
      return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden', 'reason', 'website_id');
    end;
    select external_site_id into v_token.external_site_id from public.websites where id = v_token.website_uuid;
  end if;
  if v_token.external_site_id <> p_website_id then
    return jsonb_build_object('ok', false, 'status', 403, 'error', 'forbidden', 'reason', 'website_id');
  end if;

  insert into public.rate_limits as rl (bucket, window_start, hits)
  values ('token:' || v_token.token_id::text, v_window, 1)
  on conflict (bucket, window_start) do update set hits = rl.hits + 1
  returning hits into v_hits;
  if v_hits = 1 then
    delete from public.rate_limits
     where bucket = 'token:' || v_token.token_id::text and window_start < v_window - interval '10 minutes';
  end if;
  if p_rate_limit > 0 and v_hits > p_rate_limit then
    return jsonb_build_object('ok', false, 'status', 429, 'error', 'rate_limited');
  end if;

  if v_token.last_used_at is null or v_token.last_used_at < now() - interval '1 minute' then
    update public.website_tokens set last_used_at = now() where id = v_token.token_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'website', v_token.website_uuid,
    'schema_version', (select value from public.app_meta where key = 'schema_version'),
    'form_order_ready', to_regclass('public.form_orders') is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Katalog: upsert + aturan revisi
-- ---------------------------------------------------------------------------
create or replace function private.dh_touch_invitation(p_invitation uuid, p_title text, p_owner text)
returns void
language sql
set search_path = ''
as $$
  update public.invitations
     set title = p_title, owner_external_id = p_owner
   where id = p_invitation
     and (title is distinct from p_title or owner_external_id is distinct from p_owner);
$$;

create or replace function private.dh_sync(p_website uuid, p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_post bigint := (p ->> 'invitation_id')::bigint;
  v_key text := p ->> 'registry_id';
  v_version bigint := (p ->> 'catalog_version')::bigint;
  v_hash text := p ->> 'catalog_hash';
  v_title text := coalesce(p ->> 'invitation_title', '');
  v_owner text := p ->> 'owner_id';
  v_invitation uuid;
  v_registry public.registries;
begin
  insert into public.invitations (website_id, wp_post_id, title, owner_external_id)
  values (p_website, v_post, v_title, v_owner)
  on conflict (website_id, wp_post_id) do nothing
  returning id into v_invitation;
  if v_invitation is null then
    select id into v_invitation from public.invitations where website_id = p_website and wp_post_id = v_post;
  end if;

  -- Jalur cepat tanpa lock: revisi & hash sama → katalog tidak dibuat ulang.
  select * into v_registry from public.registries where invitation_id = v_invitation and registry_key = v_key;
  if found then
    if v_registry.catalog_version > v_version
       or (v_registry.catalog_version = v_version and v_registry.catalog_hash <> v_hash) then
      raise exception 'catalog_stale';
    end if;
    if v_registry.catalog_version = v_version and v_registry.catalog_hash = v_hash then
      perform private.dh_touch_invitation(v_invitation, v_title, v_owner);
      return v_registry.id;
    end if;
  end if;

  -- Perlu menulis: kunci hanya baris registry ini.
  v_registry := null;
  insert into public.registries (invitation_id, registry_key, document_id, element_id, catalog_version, catalog_hash)
  values (v_invitation, v_key, (p ->> 'document_id')::bigint, p ->> 'element_id', v_version, v_hash)
  on conflict (invitation_id, registry_key) do nothing
  returning * into v_registry;

  if v_registry.id is null then
    select * into v_registry from public.registries
     where invitation_id = v_invitation and registry_key = v_key
     for update;
    if v_registry.catalog_version > v_version
       or (v_registry.catalog_version = v_version and v_registry.catalog_hash <> v_hash) then
      raise exception 'catalog_stale';
    end if;
    if v_registry.catalog_version = v_version and v_registry.catalog_hash = v_hash then
      perform private.dh_touch_invitation(v_invitation, v_title, v_owner);
      return v_registry.id;
    end if;
    update public.registries
       set catalog_version = v_version, catalog_hash = v_hash,
           document_id = (p ->> 'document_id')::bigint, element_id = p ->> 'element_id'
     where id = v_registry.id;
  end if;

  insert into public.gifts as g (registry_id, invitation_id, gift_key, name, description, image_url, purchase_url,
                                 initial_quantity, capacity, manual_status, active, position)
  select v_registry.id, v_invitation, e.item ->> 'gift_id', e.item ->> 'name', e.item ->> 'description',
         e.item ->> 'image_url', e.item ->> 'purchase_url', (e.item ->> 'initial_quantity')::integer,
         (e.item ->> 'available_quantity')::integer, e.item ->> 'availability', true, (e.ord - 1)::integer
    from jsonb_array_elements(coalesce(p -> 'gifts', '[]'::jsonb)) with ordinality as e(item, ord)
  on conflict (registry_id, gift_key) do update
     set name = excluded.name, description = excluded.description, image_url = excluded.image_url,
         purchase_url = excluded.purchase_url, initial_quantity = excluded.initial_quantity,
         capacity = excluded.capacity, manual_status = excluded.manual_status, active = true,
         position = excluded.position;

  -- Hadiah yang dihapus dari katalog menjadi inactive; riwayat reservasi tetap.
  update public.gifts
     set active = false
   where registry_id = v_registry.id
     and active
     and gift_key <> all (array(select x ->> 'gift_id' from jsonb_array_elements(coalesce(p -> 'gifts', '[]'::jsonb)) as x));

  perform private.dh_touch_invitation(v_invitation, v_title, v_owner);
  return v_registry.id;
end;
$$;

-- Stok seluruh hadiah aktif pada registry (urutan katalog).
create or replace function private.dh_stock(p_registry uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'gift_id', s.gift_key,
           'initial_quantity', s.initial_quantity,
           'available_quantity', s.available,
           'availability', case when s.available > 0 then 'available' else 'unavailable' end
         ) order by s.position, s.gift_key), '[]'::jsonb)
    from (
      select g.gift_key, g.initial_quantity, g.position,
             case when g.manual_status = 'available'
                  then greatest(0, g.capacity - coalesce((
                         select sum(r.quantity) from public.reservations r
                          where r.gift_id = g.id and r.status = 'confirmed'), 0))::integer
                  else 0 end as available
        from public.gifts g
       where g.registry_id = p_registry and g.active
    ) s;
$$;

-- ---------------------------------------------------------------------------
-- Operasi Daftar Hadiah
-- ---------------------------------------------------------------------------
create or replace function public.api_dh_catalog(p_website uuid, p jsonb)
returns jsonb
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_registry uuid;
begin
  v_registry := private.dh_sync(p_website, p);
  return jsonb_build_object('gifts', private.dh_stock(v_registry));
end;
$$;

create or replace function public.api_dh_reserve(p_website uuid, p jsonb)
returns jsonb
language plpgsql
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_registry uuid;
  v_invitation uuid;
  v_site_external text;
  v_gift public.gifts;
  v_existing public.reservations;
  v_reserved integer;
  v_available integer;
  v_guest_name text := p -> 'guest' ->> 'name';
  v_whatsapp text := p -> 'guest' ->> 'whatsapp';
  v_message text := coalesce(p ->> 'message', '');
  v_gift_key text := p ->> 'gift_id';
  v_request text := p ->> 'request_id';
  v_payload_hash text;
  v_guest_id text;
  v_new public.reservations;
begin
  if coalesce((p ->> 'quantity')::integer, 0) <> 1 then
    raise exception 'invalid_request';
  end if;

  -- 1-2. Validasi & upsert katalog + pemeriksaan revisi.
  v_registry := private.dh_sync(p_website, p);
  select r.invitation_id into v_invitation from public.registries r where r.id = v_registry;
  select w.external_site_id into v_site_external from public.websites w where w.id = p_website;

  v_payload_hash := encode(sha256(convert_to(jsonb_build_array(
    p ->> 'website_id', (p ->> 'invitation_id')::bigint, p ->> 'registry_id', v_gift_key, 1,
    v_guest_name, v_whatsapp, v_message)::text, 'UTF8')), 'hex');
  v_guest_id := 'guest-' || encode(sha256(convert_to(
    v_site_external || '|' || (p ->> 'invitation_id') || '|' || v_whatsapp, 'UTF8')), 'hex');

  -- 3. Idempotency (request_id unik per website).
  select * into v_existing from public.reservations where website_id = p_website and request_id = v_request;
  if found then
    if v_existing.payload_hash <> v_payload_hash or v_existing.status <> 'confirmed' then
      raise exception 'request_conflict';
    end if;
    return jsonb_build_object('status', 'confirmed', 'reservation_id', v_existing.id, 'gift_id', v_gift_key,
      'quantity', 1, 'timestamp', private.iso_utc(v_existing.created_at), 'already_reserved', true,
      'gifts', private.dh_stock(v_registry));
  end if;

  -- 5. Lock baris hadiah yang relevan saja.
  select * into v_gift from public.gifts
   where registry_id = v_registry and gift_key = v_gift_key and active
   for update;
  if not found then
    raise exception 'gift_unavailable';
  end if;

  -- Periksa ulang idempotency di bawah lock (permintaan identik paralel).
  select * into v_existing from public.reservations where website_id = p_website and request_id = v_request;
  if found then
    if v_existing.payload_hash <> v_payload_hash or v_existing.status <> 'confirmed' then
      raise exception 'request_conflict';
    end if;
    return jsonb_build_object('status', 'confirmed', 'reservation_id', v_existing.id, 'gift_id', v_gift_key,
      'quantity', 1, 'timestamp', private.iso_utc(v_existing.created_at), 'already_reserved', true,
      'gifts', private.dh_stock(v_registry));
  end if;

  -- 4. Tamu (nomor WhatsApp) yang sama sudah memilih hadiah yang sama di undangan ini.
  select * into v_existing from public.reservations
   where gift_id = v_gift.id and guest_id = v_guest_id and status = 'confirmed';
  if found then
    return jsonb_build_object('status', 'confirmed', 'reservation_id', v_existing.id, 'gift_id', v_gift_key,
      'quantity', 1, 'timestamp', private.iso_utc(v_existing.created_at), 'already_reserved', true,
      'gifts', private.dh_stock(v_registry));
  end if;

  -- 6. Pastikan stok tersedia.
  select coalesce(sum(r.quantity), 0)::integer into v_reserved
    from public.reservations r where r.gift_id = v_gift.id and r.status = 'confirmed';
  v_available := case when v_gift.manual_status = 'available' then greatest(0, v_gift.capacity - v_reserved) else 0 end;
  if v_available < 1 then
    raise exception 'gift_unavailable';
  end if;

  -- 7. Simpan reservasi confirmed (waktu & status ditentukan backend).
  insert into public.reservations (website_id, invitation_id, registry_id, gift_id, request_id, payload_hash, quantity,
                                   guest_id, guest_name, guest_whatsapp, message, gift_name, invitation_title, status)
  values (p_website, v_invitation, v_registry, v_gift.id, v_request, v_payload_hash, 1,
          v_guest_id, v_guest_name, v_whatsapp, v_message, v_gift.name, coalesce(p ->> 'invitation_title', ''), 'confirmed')
  returning * into v_new;

  -- 8. Receipt + stok terbaru.
  return jsonb_build_object('status', 'confirmed', 'reservation_id', v_new.id, 'gift_id', v_gift_key,
    'quantity', 1, 'timestamp', private.iso_utc(v_new.created_at), 'already_reserved', false,
    'gifts', private.dh_stock(v_registry));
end;
$$;

create or replace function public.api_dh_reservations(p_website uuid, p jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_registry uuid;
  v_offset integer := coalesce((p ->> 'offset')::integer, 0);
  v_total integer;
  v_rows jsonb;
begin
  if v_offset < 0 or v_offset > 10000000 then
    raise exception 'invalid_request';
  end if;
  select r.id into v_registry
    from public.registries r
    join public.invitations i on i.id = r.invitation_id
   where i.website_id = p_website
     and i.wp_post_id = (p ->> 'invitation_id')::bigint
     and r.registry_key = p ->> 'registry_id';
  if v_registry is null then
    return jsonb_build_object('reservations', '[]'::jsonb, 'total', 0, 'next_offset', null);
  end if;

  select count(*)::integer into v_total from public.reservations where registry_id = v_registry;
  select coalesce(jsonb_agg(jsonb_build_object(
           'reservation_id', x.id, 'gift_id', x.gift_key, 'gift_name', x.gift_name, 'quantity', x.quantity,
           'guest', jsonb_build_object('id', x.guest_id, 'name', x.guest_name, 'whatsapp', x.guest_whatsapp),
           'message', x.message, 'timestamp', private.iso_utc(x.created_at), 'status', x.status
         ) order by x.created_at desc, x.id desc), '[]'::jsonb)
    into v_rows
    from (
      select r.id, g.gift_key, r.gift_name, r.quantity, r.guest_id, r.guest_name, r.guest_whatsapp,
             r.message, r.created_at, r.status
        from public.reservations r
        join public.gifts g on g.id = r.gift_id
       where r.registry_id = v_registry
       order by r.created_at desc, r.id desc
       offset v_offset limit 30
    ) x;

  return jsonb_build_object('reservations', v_rows, 'total', v_total,
    'next_offset', case when v_offset + 30 < v_total then v_offset + 30 else null end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Form Order (tulis saja; tidak ada operasi baca untuk token website)
-- ---------------------------------------------------------------------------
create or replace function public.api_form_order_submit(p_website uuid, p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hash text;
  v_row record;
begin
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'post_id', (p ->> 'post_id')::bigint,
    'document_id', (p ->> 'document_id')::bigint,
    'element_id', p ->> 'element_id',
    'fields', p -> 'fields')::text, 'UTF8')), 'hex');

  insert into public.form_orders (website_id, request_id, payload_hash, post_id, post_title, document_id, element_id, fields, labels)
  values (p_website, p ->> 'request_id', v_hash, (p ->> 'post_id')::bigint, coalesce(p ->> 'post_title', ''),
          (p ->> 'document_id')::bigint, p ->> 'element_id', p -> 'fields', p -> 'labels')
  on conflict (website_id, request_id) do nothing
  returning id, created_at, payload_hash into v_row;

  if v_row.id is null then
    select id, created_at, payload_hash into v_row
      from public.form_orders where website_id = p_website and request_id = p ->> 'request_id';
    if v_row.payload_hash <> v_hash then
      raise exception 'request_conflict';
    end if;
    return jsonb_build_object('order_id', v_row.id, 'timestamp', private.iso_utc(v_row.created_at), 'duplicate', true);
  end if;

  return jsonb_build_object('order_id', v_row.id, 'timestamp', private.iso_utc(v_row.created_at), 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Hak eksekusi eksplisit
-- ---------------------------------------------------------------------------
revoke all on function public.api_authenticate(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.api_dh_catalog(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.api_dh_reserve(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.api_dh_reservations(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.api_form_order_submit(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.api_authenticate(text, text, text, text, integer) to service_role;
grant execute on function public.api_dh_catalog(uuid, jsonb) to service_role;
grant execute on function public.api_dh_reserve(uuid, jsonb) to service_role;
grant execute on function public.api_dh_reservations(uuid, jsonb) to service_role;
grant execute on function public.api_form_order_submit(uuid, jsonb) to service_role;

revoke all on function private.dh_touch_invitation(uuid, text, text) from public, anon, authenticated;
revoke all on function private.dh_sync(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.dh_stock(uuid) from public, anon, authenticated;
revoke all on function private.iso_utc(timestamptz) from public, anon;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
grant execute on function private.dh_touch_invitation(uuid, text, text) to service_role;
grant execute on function private.dh_sync(uuid, jsonb) to service_role;
grant execute on function private.dh_stock(uuid) to service_role;
grant execute on function private.iso_utc(timestamptz) to service_role, authenticated;


-- ============================================================================
-- SECTION: 20261016000300_mdundig_dashboard.sql
-- ============================================================================

-- MDUNDIG — view & fungsi dashboard. Semua view memakai security_invoker
-- sehingga RLS tabel dasar tetap berlaku untuk pengguna yang memanggil.

create or replace view public.gift_stock
with (security_invoker = true) as
select g.id, g.registry_id, g.invitation_id, g.gift_key, g.name, g.description, g.image_url, g.purchase_url,
       g.initial_quantity, g.capacity, g.manual_status, g.active, g.position, g.updated_at,
       coalesce(rs.reserved, 0)::integer as reserved_quantity,
       case when g.manual_status = 'available' then greatest(0, g.capacity - coalesce(rs.reserved, 0))::integer else 0 end
         as available_quantity
  from public.gifts g
  left join lateral (
    select sum(r.quantity) as reserved from public.reservations r where r.gift_id = g.id and r.status = 'confirmed'
  ) rs on true;

create or replace view public.invitation_overview
with (security_invoker = true) as
select i.id, i.website_id, w.name as website_name, i.wp_post_id, i.title, i.owner_external_id,
       i.created_at, i.updated_at,
       (select count(*) from public.registries r where r.invitation_id = i.id)::integer as registry_count,
       (select count(*) from public.gifts g where g.invitation_id = i.id and g.active)::integer as gift_count,
       (select count(*) from public.reservations r where r.invitation_id = i.id and r.status = 'confirmed')::integer
         as reservation_count,
       (select count(*) from public.owner_mappings m
         where m.website_id = i.website_id and m.external_owner_id = i.owner_external_id)::integer as mapped_user_count,
       (select count(*) from public.invitation_access a where a.invitation_id = i.id)::integer as access_count,
       lower(i.title) as search_title
  from public.invitations i
  left join public.websites w on w.id = i.website_id;

create or replace view public.reservation_report
with (security_invoker = true) as
select r.id, r.invitation_id, r.registry_id, r.gift_id, i.title as invitation_title, i.website_id,
       r.gift_name, g.gift_key, r.guest_name, r.guest_whatsapp, r.message, r.quantity, r.status, r.created_at,
       lower(r.guest_name || ' ' || r.gift_name || ' ' || i.title) as search_text
  from public.reservations r
  join public.invitations i on i.id = r.invitation_id
  join public.gifts g on g.id = r.gift_id;

revoke all on public.gift_stock, public.invitation_overview, public.reservation_report from anon, public;
grant select on public.gift_stock, public.invitation_overview, public.reservation_report to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Pengelolaan token oleh admin (SECURITY INVOKER: RLS & hak kolom berlaku).
-- Hash dihitung di server; fungsi ini hanya menjamin atomisitas rotasi.
-- ---------------------------------------------------------------------------
create or replace function public.admin_rotate_token(p_token uuid, p_new_hash text, p_new_hint text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_old record;
  v_new uuid;
begin
  if not (select private.is_platform_admin()) then
    raise exception 'forbidden';
  end if;
  select id, website_id, label, scopes, revoked_at into v_old from public.website_tokens where id = p_token for update;
  if not found or v_old.revoked_at is not null then
    raise exception 'not_found';
  end if;
  insert into public.website_tokens (website_id, label, token_hash, token_hint, scopes, created_by)
  values (v_old.website_id, v_old.label, p_new_hash, p_new_hint, v_old.scopes, (select auth.uid()))
  returning id into v_new;
  update public.website_tokens
     set revoked_at = now(), revoked_by = (select auth.uid()), replaced_by = v_new
   where id = v_old.id;
  insert into public.access_audit (actor_id, action, target, detail)
  values ((select auth.uid()), 'token.rotate', v_old.id::text, jsonb_build_object('new_token', v_new));
  return v_new;
end;
$$;
revoke all on function public.admin_rotate_token(uuid, text, text) from public, anon;
grant execute on function public.admin_rotate_token(uuid, text, text) to authenticated;

-- Ringkasan platform untuk admin (Form Order hanya dihitung di sini).
create or replace function public.admin_platform_summary()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if not (select private.is_platform_admin()) then
    raise exception 'forbidden';
  end if;
  return jsonb_build_object(
    'websites', (select count(*) from public.websites),
    'active_tokens', (select count(*) from public.website_tokens where revoked_at is null),
    'invitations', (select count(*) from public.invitations),
    'unmapped_invitations', (select count(*) from public.invitations i
                              where not exists (select 1 from public.invitation_access a where a.invitation_id = i.id)
                                and not exists (select 1 from public.owner_mappings m
                                                 where m.website_id = i.website_id and m.external_owner_id = i.owner_external_id)),
    'reservations', (select count(*) from public.reservations where status = 'confirmed'),
    'form_orders', (select count(*) from public.form_orders)
  );
end;
$$;
revoke all on function public.admin_platform_summary() from public, anon;
grant execute on function public.admin_platform_summary() to authenticated;

-- Ringkasan Daftar Hadiah pengguna saat ini (tanpa Form Order).
create or replace function public.my_registry_summary()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'invitations', (select count(*) from public.invitations),
    'gifts', (select count(*) from public.gifts where active),
    'reservations', (select count(*) from public.reservations where status = 'confirmed')
  );
$$;
revoke all on function public.my_registry_summary() from public, anon;
grant execute on function public.my_registry_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap admin platform: jalankan manual dari SQL Editor (role postgres)
-- atau script server dengan secret key. Tidak dapat dipanggil pengguna biasa.
--   select public.bootstrap_platform_admin('admin@domain.com');
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_platform_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'user_not_found: buat akun Auth terlebih dahulu (undang/daftarkan email ini)';
  end if;
  insert into public.profiles (id, email) values (v_user, lower(trim(p_email))) on conflict (id) do nothing;
  insert into public.platform_admins (user_id, note) values (v_user, 'bootstrap') on conflict (user_id) do nothing;
  insert into public.access_audit (actor_id, action, target) values (null, 'admin.bootstrap', v_user::text);
  return v_user;
end;
$$;
revoke all on function public.bootstrap_platform_admin(text) from public, anon, authenticated;
grant execute on function public.bootstrap_platform_admin(text) to service_role;

insert into public.app_meta (key, value) values ('schema_version', '1')
on conflict (key) do update set value = excluded.value, updated_at = now();


-- ============================================================================
-- SECTION: 20261016000400_mdundig_accounts.sql
-- ============================================================================

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


-- ============================================================================
-- SECTION: 20261016000500_mdundig_admin_crud.sql
-- ============================================================================

-- MDUNDIG — CRUD admin. Non-destruktif: menambah kolom (dengan default), policy, dan fungsi.
-- Semua penulisan oleh dashboard tetap dibatasi admin platform (RLS / pemeriksaan di fungsi).

-- ---------------------------------------------------------------------------
-- Reservasi: sumber, catatan admin, waktu ubah
-- ---------------------------------------------------------------------------
alter table public.reservations add column if not exists source text not null default 'widget';
alter table public.reservations add column if not exists admin_note text not null default '';
alter table public.reservations add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_source_check') then
    alter table public.reservations add constraint reservations_source_check check (source in ('widget', 'admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_admin_note_check') then
    alter table public.reservations add constraint reservations_admin_note_check check (char_length(admin_note) <= 1000);
  end if;
end $$;
drop trigger if exists reservations_touch on public.reservations;
create trigger reservations_touch before update on public.reservations for each row execute function private.touch_updated_at();

create or replace view public.reservation_report
with (security_invoker = true) as
select r.id, r.invitation_id, r.registry_id, r.gift_id, i.title as invitation_title, i.website_id,
       r.gift_name, g.gift_key, r.guest_name, r.guest_whatsapp, r.message, r.quantity, r.status, r.created_at,
       lower(r.guest_name || ' ' || r.gift_name || ' ' || i.title) as search_text,
       r.source, r.admin_note, r.updated_at
  from public.reservations r
  join public.invitations i on i.id = r.invitation_id
  join public.gifts g on g.id = r.gift_id;
grant select on public.reservation_report to authenticated, service_role;

create or replace function private.validate_guest(p_name text, p_whatsapp text, p_message text, p_note text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_name is null or btrim(p_name) = '' or char_length(p_name) > 100
     or p_whatsapp is null or p_whatsapp !~ '^[1-9][0-9]{7,14}$'
     or char_length(coalesce(p_message, '')) > 1000 or char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'invalid_request';
  end if;
end;
$$;

create or replace function private.gift_available(p_gift public.gifts)
returns integer
language sql
stable
set search_path = ''
as $$
  select case when p_gift.active and p_gift.manual_status = 'available'
              then greatest(0, p_gift.capacity - coalesce((select sum(r.quantity) from public.reservations r
                                                          where r.gift_id = p_gift.id and r.status = 'confirmed'), 0))::integer
              else 0 end;
$$;

create or replace function private.guest_id_for(p_invitation uuid, p_whatsapp text)
returns text
language sql
stable
set search_path = ''
as $$
  select 'guest-' || encode(sha256(convert_to(coalesce(w.external_site_id, '') || '|' || i.wp_post_id || '|' || p_whatsapp, 'UTF8')), 'hex')
    from public.invitations i join public.websites w on w.id = i.website_id
   where i.id = p_invitation;
$$;

-- Tambah reservasi manual (mis. tamu memesan lewat telepon). Lock baris hadiah → aman dari oversell.
create or replace function public.admin_reservation_create(p_gift uuid, p_name text, p_whatsapp text, p_message text, p_note text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_gift public.gifts;
  v_inv public.invitations;
  v_guest text;
  v_id uuid;
  v_request text;
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  perform private.validate_guest(p_name, p_whatsapp, p_message, p_note);
  select * into v_gift from public.gifts where id = p_gift for update;
  if not found then raise exception 'not_found'; end if;
  select * into v_inv from public.invitations where id = v_gift.invitation_id;
  v_guest := private.guest_id_for(v_inv.id, p_whatsapp);
  if exists (select 1 from public.reservations where gift_id = v_gift.id and guest_id = v_guest and status = 'confirmed') then
    raise exception 'duplicate_guest';
  end if;
  if private.gift_available(v_gift) < 1 then raise exception 'gift_unavailable'; end if;
  v_request := encode(sha256(convert_to(gen_random_uuid()::text || clock_timestamp()::text, 'UTF8')), 'hex');
  insert into public.reservations (website_id, invitation_id, registry_id, gift_id, request_id, payload_hash, quantity, guest_id,
                                   guest_name, guest_whatsapp, message, gift_name, invitation_title, status, source, admin_note)
  values (v_inv.website_id, v_inv.id, v_gift.registry_id, v_gift.id, v_request, v_request, 1, v_guest,
          btrim(p_name), p_whatsapp, coalesce(p_message, ''), v_gift.name, v_inv.title, 'confirmed', 'admin', coalesce(p_note, ''))
  returning id into v_id;
  insert into public.access_audit (actor_id, action, target) values ((select auth.uid()), 'reservation.create', v_id::text);
  return v_id;
end;
$$;

-- Ubah data tamu / status. Mengaktifkan kembali reservasi yang dibatalkan memeriksa stok.
create or replace function public.admin_reservation_update(p_id uuid, p_name text, p_whatsapp text, p_message text, p_status text, p_note text default '')
returns void
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_gift_id uuid;
  v_gift public.gifts;
  v_row public.reservations;
  v_guest text;
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('confirmed', 'cancelled') then raise exception 'invalid_request'; end if;
  perform private.validate_guest(p_name, p_whatsapp, p_message, p_note);
  select gift_id into v_gift_id from public.reservations where id = p_id;
  if v_gift_id is null then raise exception 'not_found'; end if;
  -- Urutan lock sama dengan reserve: hadiah dulu, lalu reservasi.
  select * into v_gift from public.gifts where id = v_gift_id for update;
  select * into v_row from public.reservations where id = p_id for update;
  v_guest := private.guest_id_for(v_row.invitation_id, p_whatsapp);
  if p_status = 'confirmed' and v_row.status <> 'confirmed' and private.gift_available(v_gift) < 1 then
    raise exception 'gift_unavailable';
  end if;
  begin
    update public.reservations
       set guest_name = btrim(p_name), guest_whatsapp = p_whatsapp, guest_id = v_guest, message = coalesce(p_message, ''),
           status = p_status, admin_note = coalesce(p_note, '')
     where id = p_id;
  exception when unique_violation then
    raise exception 'duplicate_guest';
  end;
  insert into public.access_audit (actor_id, action, target, detail)
  values ((select auth.uid()), 'reservation.update', p_id::text, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.admin_reservation_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  delete from public.reservations where id = p_id;
  if not found then raise exception 'not_found'; end if;
  insert into public.access_audit (actor_id, action, target) values ((select auth.uid()), 'reservation.delete', p_id::text);
end;
$$;

revoke all on function private.validate_guest(text, text, text, text) from public, anon, authenticated;
revoke all on function private.gift_available(public.gifts) from public, anon, authenticated;
revoke all on function private.guest_id_for(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_reservation_create(uuid, text, text, text, text) from public, anon;
revoke all on function public.admin_reservation_update(uuid, text, text, text, text, text) from public, anon;
revoke all on function public.admin_reservation_delete(uuid) from public, anon;
grant execute on function public.admin_reservation_create(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_reservation_update(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_reservation_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Order Undangan (form_orders): status, catatan, order manual
-- ---------------------------------------------------------------------------
alter table public.form_orders alter column post_id drop not null;
alter table public.form_orders alter column document_id drop not null;
alter table public.form_orders alter column element_id drop not null;
alter table public.form_orders add column if not exists status text not null default 'baru';
alter table public.form_orders add column if not exists admin_note text not null default '';
alter table public.form_orders add column if not exists source text not null default 'widget';
alter table public.form_orders add column if not exists updated_at timestamptz not null default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'form_orders_status_check') then
    alter table public.form_orders add constraint form_orders_status_check check (status in ('baru', 'diproses', 'selesai', 'batal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'form_orders_source_check') then
    alter table public.form_orders add constraint form_orders_source_check check (source in ('widget', 'admin'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'form_orders_admin_note_check') then
    alter table public.form_orders add constraint form_orders_admin_note_check check (char_length(admin_note) <= 2000);
  end if;
end $$;
drop trigger if exists form_orders_touch on public.form_orders;
create trigger form_orders_touch before update on public.form_orders for each row execute function private.touch_updated_at();
create index if not exists form_orders_status_idx on public.form_orders (status, created_at desc);

grant insert (website_id, request_id, payload_hash, post_title, fields, labels, status, admin_note, source) on public.form_orders to authenticated;
grant update (post_title, fields, labels, status, admin_note) on public.form_orders to authenticated;
grant delete on public.form_orders to authenticated;
drop policy if exists form_orders_admin_insert on public.form_orders;
create policy form_orders_admin_insert on public.form_orders for insert to authenticated
  with check ((select private.is_platform_admin()) and source = 'admin');
drop policy if exists form_orders_admin_update on public.form_orders;
create policy form_orders_admin_update on public.form_orders for update to authenticated
  using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));
drop policy if exists form_orders_admin_delete on public.form_orders;
create policy form_orders_admin_delete on public.form_orders for delete to authenticated
  using ((select private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- Undangan: admin dapat menghapus undangan tanpa reservasi (FK reservasi = restrict)
-- ---------------------------------------------------------------------------
grant delete on public.invitations to authenticated;
drop policy if exists invitations_admin_delete on public.invitations;
create policy invitations_admin_delete on public.invitations for delete to authenticated
  using ((select private.is_platform_admin()));

-- ---------------------------------------------------------------------------
-- Token Website: hanya token yang sudah dicabut yang dapat dihapus
-- ---------------------------------------------------------------------------
grant delete on public.website_tokens to authenticated;
drop policy if exists website_tokens_admin_delete on public.website_tokens;
create policy website_tokens_admin_delete on public.website_tokens for delete to authenticated
  using ((select private.is_platform_admin()) and revoked_at is not null);


-- ============================================================================
-- SECTION: 20261016000600_mdundig_invitation_delete.sql
-- ============================================================================

-- MDUNDIG — hapus undangan beserta isinya (reservasi, katalog, akses), satu atau banyak sekaligus.
-- Khusus admin platform, dalam satu transaksi. Non-destruktif terhadap skema.
create or replace function public.admin_invitations_delete(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_reservations integer;
  v_invitations integer;
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'invalid_request'; end if;
  delete from public.reservations where invitation_id = any (p_ids);
  get diagnostics v_reservations = row_count;
  -- registries, gifts, invitation_access ikut terhapus (on delete cascade).
  delete from public.invitations where id = any (p_ids);
  get diagnostics v_invitations = row_count;
  insert into public.access_audit (actor_id, action, target, detail)
  values ((select auth.uid()), 'invitation.delete', left(array_to_string(p_ids, ','), 200),
          jsonb_build_object('invitations', v_invitations, 'reservations', v_reservations));
  return jsonb_build_object('invitations', v_invitations, 'reservations', v_reservations);
end;
$$;
revoke all on function public.admin_invitations_delete(uuid[]) from public, anon;
grant execute on function public.admin_invitations_delete(uuid[]) to authenticated;


-- ============================================================================
-- SECTION: 20261016000700_mdundig_dashboard_stats.sql
-- ============================================================================

-- MDUNDIG — statistik dashboard dalam satu panggilan.
-- SECURITY INVOKER: semua angka dihitung dari baris yang boleh dilihat pemanggil (RLS),
-- jadi pelanggan otomatis hanya melihat datanya sendiri. Bagian admin (order, website,
-- audit) hanya diisi bila pemanggil admin platform. Hari dihitung dalam zona Asia/Jakarta.
create or replace function public.dashboard_stats(p_days integer default 7)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_days integer := case when p_days in (7, 14, 30, 90) then p_days else 7 end;
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_admin boolean := private.is_platform_admin();
  v_result jsonb;
begin
  with days as (
    select generate_series(v_today - (greatest(v_days, 14) - 1), v_today, interval '1 day')::date as d
  ),
  inv as (select (created_at at time zone 'Asia/Jakarta')::date as d from public.invitations),
  gft as (select (created_at at time zone 'Asia/Jakarta')::date as d from public.gifts where active),
  res as (select (created_at at time zone 'Asia/Jakarta')::date as d, status from public.reservations),
  daily as (
    select days.d,
      (select count(*) from inv where inv.d = days.d)::int as invitations,
      (select count(*) from gft where gft.d = days.d)::int as gifts,
      (select count(*) from res where res.d = days.d and res.status = 'confirmed')::int as confirmed,
      (select count(*) from res where res.d = days.d and res.status = 'cancelled')::int as cancelled
    from days
  ),
  kpi as (
    select
      jsonb_build_object(
        'total', (select count(*) from public.invitations),
        'this_week', (select coalesce(sum(invitations), 0) from daily where d > v_today - 7),
        'last_week', (select coalesce(sum(invitations), 0) from daily where d <= v_today - 7 and d > v_today - 14),
        'series', (select jsonb_agg(invitations order by d) from daily where d > v_today - 7)) as invitations,
      jsonb_build_object(
        'total', (select count(*) from public.gifts where active),
        'this_week', (select coalesce(sum(gifts), 0) from daily where d > v_today - 7),
        'last_week', (select coalesce(sum(gifts), 0) from daily where d <= v_today - 7 and d > v_today - 14),
        'series', (select jsonb_agg(gifts order by d) from daily where d > v_today - 7)) as gifts,
      jsonb_build_object(
        'total', (select count(*) from public.reservations where status = 'confirmed'),
        'this_week', (select coalesce(sum(confirmed), 0) from daily where d > v_today - 7),
        'last_week', (select coalesce(sum(confirmed), 0) from daily where d <= v_today - 7 and d > v_today - 14),
        'series', (select jsonb_agg(confirmed order by d) from daily where d > v_today - 7)) as reservations
  )
  select jsonb_build_object(
    'today', v_today,
    'days', v_days,
    'kpis', jsonb_build_object('invitations', kpi.invitations, 'gifts', kpi.gifts, 'reservations', kpi.reservations),
    'trend', (select jsonb_agg(jsonb_build_object('date', d, 'confirmed', confirmed, 'cancelled', cancelled) order by d)
                from daily where d > v_today - v_days),
    'status', jsonb_build_object(
      'confirmed', (select count(*) from public.reservations where status = 'confirmed'),
      'cancelled', (select count(*) from public.reservations where status = 'cancelled')),
    'top_gifts', coalesce((
      select jsonb_agg(t order by t.count desc, t.name)
        from (
          select g.id as gift_id, g.name, g.image_url, i.title as invitation_title,
                 (select count(*) from public.reservations r where r.gift_id = g.id and r.status = 'confirmed')::int as count
            from public.gifts g join public.invitations i on i.id = g.invitation_id
           where g.active
           order by 5 desc, g.name
           limit 5
        ) t), '[]'::jsonb)
  )
  into v_result
  from kpi;

  if v_admin then
    v_result := v_result || jsonb_build_object(
      'websites', jsonb_build_object(
        'total', (select count(*) from public.websites),
        'active', (select count(*) from public.websites where status = 'active'),
        'active_tokens', (select count(*) from public.website_tokens where revoked_at is null),
        'series', (select jsonb_agg(c order by d) from (
          select days.d, (select count(*) from public.websites w where (w.created_at at time zone 'Asia/Jakarta')::date <= days.d)::int as c
            from generate_series(v_today - 6, v_today, interval '1 day') as days(d)) s)),
      'orders', jsonb_build_object(
        'total', (select count(*) from public.form_orders),
        'today', (select count(*) from public.form_orders where (created_at at time zone 'Asia/Jakarta')::date = v_today),
        'week', (select count(*) from public.form_orders where (created_at at time zone 'Asia/Jakarta')::date > v_today - 7),
        'month', (select count(*) from public.form_orders where (created_at at time zone 'Asia/Jakarta')::date > v_today - 30),
        'new', (select count(*) from public.form_orders where status = 'baru'),
        'latest', coalesce((
          select jsonb_agg(o order by o.created_at desc)
            from (
              select id, status, created_at,
                     coalesce(nullif(fields ->> 'customer_name', ''),
                              nullif(concat_ws(' & ', nullif(fields ->> 'groom_nickname', ''), nullif(fields ->> 'bride_nickname', '')), ''),
                              nullif(post_title, ''), 'Tanpa nama') as name,
                     coalesce(nullif(fields ->> 'customer_email', ''), nullif(fields ->> 'customer_phone', ''), '') as contact
                from public.form_orders
               order by created_at desc, id desc
               limit 5
            ) o), '[]'::jsonb)),
      'activity', coalesce((
        select jsonb_agg(a order by a.at desc)
          from (
            (select 'reservation' as type, r.guest_name || ' memilih ' || r.gift_name as title, r.invitation_title as subtitle, r.created_at as at
               from public.reservations r order by r.created_at desc limit 6)
            union all
            (select 'order', 'Order masuk', coalesce(nullif(o.fields ->> 'customer_name', ''), nullif(o.post_title, ''), 'Order Undangan'), o.created_at
               from public.form_orders o order by o.created_at desc limit 6)
            union all
            (select 'audit:' || au.action, au.action, coalesce(nullif(p.display_name, ''), p.username, 'Sistem'), au.created_at
               from public.access_audit au left join public.profiles p on p.id = au.actor_id
              where au.action in ('website.create', 'website.update', 'website.delete', 'token.create', 'token.rotate', 'token.revoke',
                                  'user.create', 'user.update', 'user.delete', 'access.grant', 'access.revoke', 'invitation.delete', 'order.create')
              order by au.created_at desc limit 6)
            order by at desc
            limit 6
          ) a), '[]'::jsonb)
    );
  else
    v_result := v_result || jsonb_build_object(
      'activity', coalesce((
        select jsonb_agg(a order by a.at desc)
          from (select 'reservation' as type, r.guest_name || ' memilih ' || r.gift_name as title, r.invitation_title as subtitle, r.created_at as at
                  from public.reservations r order by r.created_at desc limit 6) a), '[]'::jsonb));
  end if;
  return v_result;
end;
$$;
revoke all on function public.dashboard_stats(integer) from public, anon;
grant execute on function public.dashboard_stats(integer) to authenticated;


-- ============================================================================
-- SECTION: 20261017000800_mdundig_widget_order_readonly.sql
-- ============================================================================

-- MDUNDIG: isi Order Undangan yang dikirim klien lewat widget bersifat hanya-lihat.
-- Admin tetap boleh mengubah status & catatan admin, dan menghapus order. Order input manual
-- (source = 'admin') tetap dapat diubah seluruhnya. Dikunci di database agar tidak bisa dilewati
-- lewat jalur mana pun (API dashboard maupun PostgREST langsung).

create or replace function private.form_orders_guard_widget_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source = 'widget' and (
    new.fields is distinct from old.fields
    or new.labels is distinct from old.labels
    or new.post_title is distinct from old.post_title
    or new.source is distinct from old.source
  ) then
    raise exception 'widget_order_readonly'
      using errcode = 'P0001',
            hint = 'Isi order dari widget hanya dapat dilihat; ubah status atau catatan admin.';
  end if;
  return new;
end;
$$;

revoke all on function private.form_orders_guard_widget_content() from public;

drop trigger if exists form_orders_guard_widget_content on public.form_orders;
create trigger form_orders_guard_widget_content
  before update on public.form_orders
  for each row execute function private.form_orders_guard_widget_content();


-- ============================================================================
-- SECTION: 20261017000900_mdundig_notifications.sql
-- ============================================================================

-- MDUNDIG: notifikasi dalam aplikasi.
-- Satu baris per penerima. Dibuat otomatis oleh trigger database saat:
--   - Order Undangan baru masuk  → semua admin platform.
--   - Reservasi hadiah baru      → semua admin + pelanggan yang berhak melihat undangan itu
--                                   (akses eksplisit atau pemetaan pemilik dari WordPress).
-- Pembuat perubahan sendiri (mis. admin yang menambah order manual) tidak diberi notifikasi.
-- Pengguna hanya bisa melihat, menandai dibaca, dan menghapus notifikasinya sendiri (RLS).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('order', 'reservation')),
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 500),
  link text not null default '' check (char_length(link) <= 300 and (link = '' or link ~ '^/[A-Za-z0-9/_?=&.-]*$')),
  invitation_id uuid references public.invitations (id) on delete cascade,
  order_id uuid references public.form_orders (id) on delete cascade,
  reservation_id uuid references public.reservations (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc, id desc);
create index if not exists notifications_user_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_order_idx on public.notifications (order_id) where order_id is not null;
create index if not exists notifications_reservation_idx on public.notifications (reservation_id) where reservation_id is not null;
create index if not exists notifications_invitation_idx on public.notifications (invitation_id) where invitation_id is not null;

alter table public.notifications enable row level security;
revoke all on public.notifications from public, anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

drop policy if exists notifications_own_select on public.notifications;
create policy notifications_own_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists notifications_own_update on public.notifications;
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists notifications_own_delete on public.notifications;
create policy notifications_own_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- Penerima notifikasi untuk satu undangan: admin + akses eksplisit + pemetaan pemilik.
create or replace function private.invitation_audience(p_invitation uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id from public.platform_admins a
  union
  select x.user_id from public.invitation_access x where x.invitation_id = p_invitation
  union
  select m.user_id
    from public.invitations i
    join public.owner_mappings m on m.website_id = i.website_id and m.external_owner_id = i.owner_external_id
   where i.id = p_invitation and i.owner_external_id is not null;
$$;
revoke all on function private.invitation_audience(uuid) from public, anon, authenticated;

create or replace function private.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := coalesce(
    nullif(btrim(new.fields ->> 'customer_name'), ''),
    nullif(btrim(new.fields ->> 'groom_nickname'), ''),
    nullif(btrim(new.fields ->> 'groom_full_name'), ''),
    'Pemesan');
  v_body text := left(v_name || case when btrim(new.post_title) <> '' then ' · ' || btrim(new.post_title) else '' end, 500);
begin
  insert into public.notifications (user_id, kind, title, body, link, order_id)
  select a.user_id, 'order',
         case when new.source = 'admin' then 'Order manual ditambahkan' else 'Order undangan baru' end,
         v_body, '/order-undangan?order=' || new.id::text, new.id
    from public.platform_admins a
   where a.user_id is distinct from (select auth.uid());
  return new;
end;
$$;
revoke all on function private.notify_new_order() from public, anon, authenticated;

create or replace function private.notify_new_reservation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  select coalesce(nullif(btrim(new.invitation_title), ''), nullif(btrim(i.title), ''), 'Tanpa judul')
    into v_title from public.invitations i where i.id = new.invitation_id;
  insert into public.notifications (user_id, kind, title, body, link, invitation_id, reservation_id)
  select r.uid, 'reservation',
         case when new.source = 'admin' then 'Reservasi manual ditambahkan' else 'Reservasi hadiah baru' end,
         left(new.guest_name || ' memilih ' || coalesce(nullif(new.gift_name, ''), 'hadiah')
              || case when new.quantity > 1 then ' (' || new.quantity || ')' else '' end
              || ' — ' || coalesce(v_title, 'Tanpa judul'), 500),
         '/daftar-hadiah/' || new.invitation_id::text, new.invitation_id, new.id
    from private.invitation_audience(new.invitation_id) as r(uid)
   where r.uid is distinct from (select auth.uid());
  return new;
end;
$$;
revoke all on function private.notify_new_reservation() from public, anon, authenticated;

drop trigger if exists form_orders_notify on public.form_orders;
create trigger form_orders_notify after insert on public.form_orders
  for each row execute function private.notify_new_order();
drop trigger if exists reservations_notify on public.reservations;
create trigger reservations_notify after insert on public.reservations
  for each row execute function private.notify_new_reservation();


-- ============================================================================
-- SECTION: 20261017001000_mdundig_fk_indexes.sql
-- ============================================================================

-- MDUNDIG: indeks untuk foreign key "dibuat/dicabut oleh" (saran Supabase performance advisor).
-- Mempercepat penghapusan akun (ON DELETE SET NULL / CASCADE memindai kolom-kolom ini) dan audit per pelaku.
create index if not exists access_audit_actor_idx on public.access_audit (actor_id);
create index if not exists invitation_access_granted_by_idx on public.invitation_access (granted_by);
create index if not exists owner_mappings_created_by_idx on public.owner_mappings (created_by);
create index if not exists website_tokens_created_by_idx on public.website_tokens (created_by);
create index if not exists website_tokens_replaced_by_idx on public.website_tokens (replaced_by);
create index if not exists website_tokens_revoked_by_idx on public.website_tokens (revoked_by);
create index if not exists websites_created_by_idx on public.websites (created_by);


-- ============================================================================
-- SECTION: 20261017001100_mdundig_one_invitation_per_user.sql
-- ============================================================================

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


-- ============================================================================
-- SECTION: 20261017001200_mdundig_profile_whatsapp.sql
-- ============================================================================

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


-- ============================================================================
-- SECTION: 20261017001300_mdundig_one_user_per_invitation.sql
-- ============================================================================

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


-- ============================================================================
-- SECTION: 20261017001400_mdundig_order_meta_events.sql
-- ============================================================================

-- MDUNDIG: (1) metadata order dari widget Form Order — nama step per field & teks tampilan opsi pilihan
--          (opsional, dikirim plugin versi baru; order lama/plugin lama tetap tanpa meta),
--          (2) kalender acara: tanggal akad/resepsi/ngunduh mantu dari isi order.

-- (1) Meta order: { "sections": {key: "Nama step"}, "options": {key: {kode: "Teks"}} }.
alter table public.form_orders add column if not exists meta jsonb not null default '{}'::jsonb;

create or replace function public.api_form_order_submit(p_website uuid, p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hash text;
  v_row record;
begin
  -- Hash hanya dari isi order (bukan meta) agar kiriman ulang dengan/tanpa meta tetap dianggap sama.
  v_hash := encode(sha256(convert_to(jsonb_build_object(
    'post_id', (p ->> 'post_id')::bigint,
    'document_id', (p ->> 'document_id')::bigint,
    'element_id', p ->> 'element_id',
    'fields', p -> 'fields')::text, 'UTF8')), 'hex');

  insert into public.form_orders (website_id, request_id, payload_hash, post_id, post_title, document_id, element_id, fields, labels, meta)
  values (p_website, p ->> 'request_id', v_hash, (p ->> 'post_id')::bigint, coalesce(p ->> 'post_title', ''),
          (p ->> 'document_id')::bigint, p ->> 'element_id', p -> 'fields', p -> 'labels',
          case when jsonb_typeof(p -> 'meta') = 'object' then p -> 'meta' else '{}'::jsonb end)
  on conflict (website_id, request_id) do nothing
  returning id, created_at, payload_hash into v_row;

  if v_row.id is null then
    select id, created_at, payload_hash into v_row
      from public.form_orders where website_id = p_website and request_id = p ->> 'request_id';
    if v_row.payload_hash <> v_hash then
      raise exception 'request_conflict';
    end if;
    return jsonb_build_object('order_id', v_row.id, 'timestamp', private.iso_utc(v_row.created_at), 'duplicate', true);
  end if;

  return jsonb_build_object('order_id', v_row.id, 'timestamp', private.iso_utc(v_row.created_at), 'duplicate', false);
end;
$$;
revoke all on function public.api_form_order_submit(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.api_form_order_submit(uuid, jsonb) to service_role;

-- (2) Tanggal aman: hanya YYYY-MM-DD yang valid; selain itu null (isi manual bebas tidak membuat error).
create or replace function private.try_date(p text)
returns date
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p::date;
exception when others then
  return null;
end;
$$;
revoke all on function private.try_date(text) from public, anon;
grant execute on function private.try_date(text) to authenticated, service_role;

-- Satu baris per acara (akad / resepsi / ngunduh mantu) yang tanggalnya terisi. security_invoker → RLS form_orders
-- (khusus admin) tetap berlaku.
create or replace view public.order_events with (security_invoker = true) as
select
  o.id as order_id,
  o.website_id,
  o.status,
  o.post_title,
  o.source,
  k.kind,
  d.event_date,
  nullif(o.fields ->> (k.prefix || '_time'), '') as event_time,
  nullif(o.fields ->> (k.prefix || '_address'), '') as address,
  nullif(o.fields ->> (k.prefix || '_maps'), '') as maps,
  coalesce(nullif(o.fields ->> 'groom_nickname', ''), nullif(o.fields ->> 'groom_full_name', '')) as groom,
  coalesce(nullif(o.fields ->> 'bride_nickname', ''), nullif(o.fields ->> 'bride_full_name', '')) as bride,
  nullif(o.fields ->> 'customer_name', '') as customer
from public.form_orders o
cross join lateral (values ('akad', 'akad', 1), ('resepsi', 'reception', 2), ('ngunduh', 'ngunduh', 3)) as k(kind, prefix, ord)
cross join lateral (select private.try_date(o.fields ->> (k.prefix || '_date')) as event_date) d
where d.event_date is not null and o.status <> 'batal';

revoke all on public.order_events from public, anon;
grant select on public.order_events to authenticated, service_role;


-- ============================================================================
-- SECTION: 20261017001500_mdundig_settings_errors_push.sql
-- ============================================================================

-- MDUNDIG: (3) pengaturan aplikasi (template pesan WhatsApp), (4) log error, (5) langganan push notification ponsel,
--          (6) notifikasi langsung (Supabase Realtime).

-- (3) Pengaturan aplikasi: hanya admin platform yang dapat membaca/mengubah.
create table if not exists public.app_settings (
  key text primary key check (key ~ '^[a-z0-9_.]{1,64}$'),
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists app_settings_updated_by_idx on public.app_settings (updated_by);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon;
grant select, insert, update, delete on public.app_settings to authenticated;
drop policy if exists app_settings_admin_all on public.app_settings;
create policy app_settings_admin_all on public.app_settings for all to authenticated
  using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()));

-- (4) Log error server & browser. Ditulis server (secret key); dibaca/dihapus admin. Disimpan 30 hari.
create table if not exists public.error_logs (
  id bigint generated always as identity primary key,
  source text not null check (source in ('server', 'client')),
  status integer,
  path text,
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists error_logs_created_at_idx on public.error_logs (created_at desc);
create index if not exists error_logs_user_id_idx on public.error_logs (user_id);
alter table public.error_logs enable row level security;
revoke all on public.error_logs from public, anon;
grant select, delete on public.error_logs to authenticated;
drop policy if exists error_logs_admin_select on public.error_logs;
create policy error_logs_admin_select on public.error_logs for select to authenticated using ((select private.is_platform_admin()));
drop policy if exists error_logs_admin_delete on public.error_logs;
create policy error_logs_admin_delete on public.error_logs for delete to authenticated using ((select private.is_platform_admin()));

create or replace function private.error_logs_retention()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.error_logs where created_at < now() - interval '30 days';
  return null;
end;
$$;
revoke all on function private.error_logs_retention() from public, anon, authenticated;
drop trigger if exists error_logs_retention on public.error_logs;
create trigger error_logs_retention after insert on public.error_logs
  for each statement execute function private.error_logs_retention();

-- (5) Langganan push notification (Web Push) per perangkat. Ditulis server; pemilik dapat melihat/menghapus miliknya.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon;
grant select, delete on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- (6) Notifikasi langsung: baris baru dikirim lewat Realtime (RLS notifications_own_select tetap berlaku).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;


-- ============================================================================
-- SECTION: 20261017001600_mdundig_session_mfa.sql
-- ============================================================================

-- MDUNDIG: info sesi untuk server — peran admin + verifikasi dua langkah (TOTP, Supabase MFA).
-- Akun yang sudah mengaktifkan verifikasi dua langkah WAJIB memakai sesi aal2; tanpa itu semua API menolak
-- (diperiksa di server, bukan hanya di tampilan). Akun tanpa faktor terverifikasi tidak terpengaruh.
create or replace function public.session_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_admin', exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid())),
    'mfa_enrolled', exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'),
    'aal', coalesce((select auth.jwt()) ->> 'aal', 'aal1')
  )
$$;
revoke all on function public.session_info() from public, anon;
grant execute on function public.session_info() to authenticated;

