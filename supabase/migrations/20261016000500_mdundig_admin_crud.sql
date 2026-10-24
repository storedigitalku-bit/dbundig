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
