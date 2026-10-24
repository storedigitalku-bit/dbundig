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
