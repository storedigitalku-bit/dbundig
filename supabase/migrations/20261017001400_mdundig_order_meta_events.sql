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
