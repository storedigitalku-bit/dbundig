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
