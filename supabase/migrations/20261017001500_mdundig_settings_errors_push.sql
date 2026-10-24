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
