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
