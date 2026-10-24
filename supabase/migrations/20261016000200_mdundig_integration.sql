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
