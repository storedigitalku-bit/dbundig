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
