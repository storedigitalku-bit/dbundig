-- Uji live (Supabase) untuk fungsi integrasi + RLS.
-- Seluruh blok berakhir dengan RAISE EXCEPTION sehingga SEMUA data uji di-rollback.
-- Hasil yang diharapkan: error "ALL_TESTS_PASSED (<n> assertions)".
do $test$
declare
  n integer := 0;
  v_site uuid; v_site2 uuid; v_tok uuid; v_tok2 uuid;
  h1 text := repeat('a', 64); h2 text := repeat('b', 64); h3 text := repeat('c', 64);
  sid1 text := 'site-' || repeat('1', 32); sid2 text := 'site-' || repeat('2', 32);
  url1 text := 'https://undangan-a.example.com/'; url2 text := 'https://undangan-b.example.com/blog/';
  r jsonb; r2 jsonb; cat jsonb; cat2 jsonb; err text; i integer;
  u_admin uuid := gen_random_uuid(); u_a uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  first_id text; first_ts text;

begin
  -- Helper assert via raise
  -- ------------------------------------------------------------------ fixtures
  insert into public.websites (name, site_url) values ('Uji A', url1) returning id into v_site;
  insert into public.websites (name, site_url) values ('Uji B', url2) returning id into v_site2;
  insert into public.website_tokens (website_id, token_hash, token_hint, scopes) values (v_site, h1, 'aaaa', array['daftar_hadiah','form_order']) returning id into v_tok;
  insert into public.website_tokens (website_id, token_hash, token_hint, scopes) values (v_site2, h2, 'bbbb', array['daftar_hadiah']) returning id into v_tok2;

  -- ------------------------------------------------------------------ auth & binding
  r := public.api_authenticate(repeat('f', 64), 'daftar_hadiah', sid1, url1, 100);
  if (r->>'status')::int <> 401 then raise exception 'ASSERT unknown token 401: %', r; end if; n := n + 1;
  r := public.api_authenticate(h1, 'daftar_hadiah', sid1, 'https://lain.example.com/', 100);
  if (r->>'status')::int <> 403 then raise exception 'ASSERT url mismatch 403: %', r; end if; n := n + 1;
  if (select external_site_id from public.websites where id = v_site) is not null then raise exception 'ASSERT no binding on url mismatch'; end if; n := n + 1;
  r := public.api_authenticate(h1, 'daftar_hadiah', sid1, url1, 100);
  if (r->>'ok')::boolean is not true or (r->>'website')::uuid <> v_site then raise exception 'ASSERT valid auth: %', r; end if; n := n + 1;
  if (select external_site_id from public.websites where id = v_site) <> sid1 then raise exception 'ASSERT first-use binding'; end if; n := n + 1;
  r := public.api_authenticate(h1, 'daftar_hadiah', sid2, url1, 100);
  if (r->>'status')::int <> 403 then raise exception 'ASSERT token A cannot use website_id B: %', r; end if; n := n + 1;
  r := public.api_authenticate(h2, 'form_order', sid2, url2, 100);
  if (r->>'status')::int <> 403 then raise exception 'ASSERT scope form_order missing → 403: %', r; end if; n := n + 1;
  r := public.api_authenticate(h2, 'daftar_hadiah', sid2, url2, 100);
  if (r->>'ok')::boolean is not true then raise exception 'ASSERT site2 auth (subdirectory url): %', r; end if; n := n + 1;
  r := public.api_authenticate(h2, 'daftar_hadiah', sid1, url2, 100);
  if (r->>'status')::int <> 403 then raise exception 'ASSERT token B cannot claim website A id: %', r; end if; n := n + 1;
  -- jendela menit ini sudah berisi 1 hit sukses; 3 hit lagi dengan batas 3 → hit ke-4 ditolak
  for i in 1..3 loop r := public.api_authenticate(h1, 'form_order', sid1, url1, 3); end loop;
  if (r->>'status')::int <> 429 then raise exception 'ASSERT rate limit: %', r; end if; n := n + 1;

  -- ------------------------------------------------------------------ katalog otomatis
  cat := jsonb_build_object('website_id', sid1, 'invitation_id', 101, 'invitation_title', 'Andi & Sari',
    'registry_id', 'registry-900-abc', 'document_id', 900, 'element_id', 'abc',
    'catalog_version', '1760000000001', 'catalog_hash', repeat('1', 64), 'owner_id', null,
    'gifts', jsonb_build_array(
      jsonb_build_object('gift_id','gift-stable','name','Rice Cooker','description','','image_url','','purchase_url','',
                         'initial_quantity',5,'available_quantity',4,'availability','available'),
      jsonb_build_object('gift_id','gift-one','name','Blender','description','','image_url','','purchase_url','',
                         'initial_quantity',1,'available_quantity',1,'availability','available'),
      jsonb_build_object('gift_id','gift-off','name','Kulkas','description','','image_url','','purchase_url','',
                         'initial_quantity',2,'available_quantity',2,'availability','unavailable')));
  r := public.api_dh_catalog(v_site, cat);
  if r->'gifts' <> '[{"gift_id":"gift-stable","initial_quantity":5,"available_quantity":4,"availability":"available"},{"gift_id":"gift-one","initial_quantity":1,"available_quantity":1,"availability":"available"},{"gift_id":"gift-off","initial_quantity":2,"available_quantity":0,"availability":"unavailable"}]'::jsonb
    then raise exception 'ASSERT first availability creates catalog (capacity≠initial, manual unavailable): %', r; end if; n := n + 1;
  if jsonb_typeof(r->'gifts'->0->'available_quantity') <> 'number' then raise exception 'ASSERT integer type'; end if; n := n + 1;
  if (select count(*) from public.invitations where website_id = v_site) <> 1 then raise exception 'ASSERT invitation auto-created'; end if; n := n + 1;
  if (select owner_external_id from public.invitations where website_id = v_site and wp_post_id = 101) is not null then raise exception 'ASSERT owner null kept'; end if; n := n + 1;

  -- ------------------------------------------------------------------ reserve + idempotency
  r := public.api_dh_reserve(v_site, cat || jsonb_build_object('gift_id','gift-stable','quantity',1,'request_id',repeat('d',64),
        'guest', jsonb_build_object('name','Budi','whatsapp','6281234567890'),'message','Selamat untuk kalian.'));
  if r->>'status' <> 'confirmed' or (r->>'already_reserved')::boolean or r->'gifts'->0->>'available_quantity' <> '3'
    then raise exception 'ASSERT reserve 4→3: %', r; end if; n := n + 1;
  if r->>'timestamp' !~ '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$' then raise exception 'ASSERT timestamp UTC Z: %', r->>'timestamp'; end if; n := n + 1;
  if r->>'reservation_id' !~ '^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$' then raise exception 'ASSERT uuid'; end if; n := n + 1;
  first_id := r->>'reservation_id'; first_ts := r->>'timestamp';
  r := public.api_dh_reserve(v_site, cat || jsonb_build_object('gift_id','gift-stable','quantity',1,'request_id',repeat('d',64),
        'guest', jsonb_build_object('name','Budi','whatsapp','6281234567890'),'message','Selamat untuk kalian.'));
  if r->>'reservation_id' <> first_id or r->>'timestamp' <> first_ts or not (r->>'already_reserved')::boolean
     or r->'gifts'->0->>'available_quantity' <> '3' then raise exception 'ASSERT idempotent retry: %', r; end if; n := n + 1;
  begin
    perform public.api_dh_reserve(v_site, cat || jsonb_build_object('gift_id','gift-stable','quantity',1,'request_id',repeat('d',64),
        'guest', jsonb_build_object('name','Budi','whatsapp','6281234567890'),'message','Pesan lain'));
    raise exception 'ASSERT request_conflict expected';
  exception when others then err := sqlerrm; end;
  if err <> 'request_conflict' then raise exception 'ASSERT request_conflict: %', err; end if; n := n + 1;
  r := public.api_dh_reserve(v_site, cat || jsonb_build_object('gift_id','gift-stable','quantity',1,'request_id',repeat('e',64),
        'guest', jsonb_build_object('name','Budi Lagi','whatsapp','6281234567890'),'message',''));
  if r->>'reservation_id' <> first_id or not (r->>'already_reserved')::boolean or r->'gifts'->0->>'available_quantity' <> '3'
    then raise exception 'ASSERT same guest same gift no duplicate: %', r; end if; n := n + 1;

  -- template sama, undangan berbeda → stok terpisah
  cat2 := jsonb_set(jsonb_set(cat, '{invitation_id}', '102'), '{invitation_title}', '"Rina & Doni"');
  r := public.api_dh_reserve(v_site, cat2 || jsonb_build_object('gift_id','gift-stable','quantity',1,'request_id',repeat('9',64),
        'guest', jsonb_build_object('name','Budi','whatsapp','6281234567890'),'message',''));
  if (r->>'already_reserved')::boolean or r->'gifts'->0->>'available_quantity' <> '3' then raise exception 'ASSERT reserve-first on new invitation, separate stock: %', r; end if; n := n + 1;
  r := public.api_dh_catalog(v_site, cat);
  if r->'gifts'->0->>'available_quantity' <> '3' then raise exception 'ASSERT inv 101 unaffected: %', r; end if; n := n + 1;

  -- website berbeda dengan ID post/gift sama → terpisah
  r := public.api_dh_catalog(v_site2, jsonb_set(cat, '{website_id}', to_jsonb(sid2)));
  if r->'gifts'->0->>'available_quantity' <> '4' then raise exception 'ASSERT website isolation: %', r; end if; n := n + 1;

  -- stok 1: hanya satu reservasi baru
  r := public.api_dh_reserve(v_site, cat || jsonb_build_object('gift_id','gift-one','quantity',1,'request_id',repeat('1',64),
        'guest', jsonb_build_object('name','Tamu 1','whatsapp','6280000000001'),'message',''));
  if r->'gifts'->1->>'available_quantity' <> '0' or r->'gifts'->1->>'availability' <> 'unavailable' then raise exception 'ASSERT stock1 consumed: %', r; end if; n := n + 1;
  err := null;
  begin
    perform public.api_dh_reserve(v_site, cat || jsonb_build_object('gift_id','gift-one','quantity',1,'request_id',repeat('2',64),
        'guest', jsonb_build_object('name','Tamu 2','whatsapp','6280000000002'),'message',''));
  exception when others then err := sqlerrm; end;
  if err is distinct from 'gift_unavailable' then raise exception 'ASSERT gift_unavailable: %', err; end if; n := n + 1;
  err := null;
  begin
    perform public.api_dh_reserve(v_site, cat || jsonb_build_object('gift_id','gift-off','quantity',1,'request_id',repeat('3',64),
        'guest', jsonb_build_object('name','Tamu 3','whatsapp','6280000000003'),'message',''));
  exception when others then err := sqlerrm; end;
  if err is distinct from 'gift_unavailable' then raise exception 'ASSERT manual unavailable: %', err; end if; n := n + 1;

  -- revisi
  err := null;
  begin perform public.api_dh_catalog(v_site, jsonb_set(cat, '{catalog_version}', '"1760000000000"'));
  exception when others then err := sqlerrm; end;
  if err is distinct from 'catalog_stale' then raise exception 'ASSERT older revision stale: %', err; end if; n := n + 1;
  err := null;
  begin perform public.api_dh_catalog(v_site, jsonb_set(cat, '{catalog_hash}', to_jsonb(repeat('2', 64))));
  exception when others then err := sqlerrm; end;
  if err is distinct from 'catalog_stale' then raise exception 'ASSERT same revision different hash: %', err; end if; n := n + 1;

  -- revisi baru: hapus gift-stable, ganti judul, sync ulang tidak mereset reservasi
  r := public.api_dh_catalog(v_site, jsonb_set(jsonb_set(jsonb_set(cat, '{catalog_version}', '"1760000000002"'),
        '{catalog_hash}', to_jsonb(repeat('3',64))), '{gifts}', (cat->'gifts') - 0) || '{"invitation_title":"Andi & Sari (baru)"}');
  if jsonb_array_length(r->'gifts') <> 2 or r->'gifts'->0->>'gift_id' <> 'gift-one' then raise exception 'ASSERT removed gift excluded: %', r; end if; n := n + 1;
  if (select active from public.gifts g join public.invitations i on i.id = g.invitation_id where i.wp_post_id = 101 and i.website_id = v_site and g.gift_key = 'gift-stable') then raise exception 'ASSERT gift inactive'; end if; n := n + 1;
  if (select count(*) from public.reservations where website_id = v_site and gift_name = 'Rice Cooker') <> 2 then raise exception 'ASSERT history kept'; end if; n := n + 1;
  if (select title from public.invitations where website_id = v_site and wp_post_id = 101) <> 'Andi & Sari (baru)' then raise exception 'ASSERT title updated'; end if; n := n + 1;
  -- aktifkan lagi dengan revisi lebih baru: reservasi lama tetap dihitung
  r := public.api_dh_catalog(v_site, jsonb_set(jsonb_set(cat, '{catalog_version}', '"1760000000003"'), '{catalog_hash}', to_jsonb(repeat('4',64))));
  if r->'gifts'->0->>'available_quantity' <> '3' then raise exception 'ASSERT resync does not reset reservations: %', r; end if; n := n + 1;
  -- katalog kosong menyimpan revisi
  r := public.api_dh_catalog(v_site, jsonb_set(jsonb_set(jsonb_set(cat, '{catalog_version}', '"1760000000004"'), '{catalog_hash}', to_jsonb(repeat('5',64))), '{gifts}', '[]'));
  if r->'gifts' <> '[]'::jsonb then raise exception 'ASSERT empty catalog: %', r; end if; n := n + 1;
  err := null;
  begin perform public.api_dh_catalog(v_site, jsonb_set(jsonb_set(cat, '{catalog_version}', '"1760000000003"'), '{catalog_hash}', to_jsonb(repeat('4',64))));
  exception when others then err := sqlerrm; end;
  if err is distinct from 'catalog_stale' then raise exception 'ASSERT empty catalog blocks old revision: %', err; end if; n := n + 1;

  -- owner_id eksternal disimpan apa adanya
  r := public.api_dh_catalog(v_site, jsonb_set(jsonb_set(cat2, '{owner_id}', '"customer-102"'), '{catalog_version}', '"1760000000001"'));
  if (select owner_external_id from public.invitations where website_id = v_site and wp_post_id = 102) <> 'customer-102' then raise exception 'ASSERT owner stored'; end if; n := n + 1;

  -- ------------------------------------------------------------------ reservations (pagination)
  r := public.api_dh_catalog(v_site, jsonb_set(jsonb_set(jsonb_set(cat, '{invitation_id}', '103'), '{gifts,0,initial_quantity}', '100'), '{gifts,0,available_quantity}', '100'));
  for i in 1..31 loop
    perform public.api_dh_reserve(v_site, jsonb_set(jsonb_set(jsonb_set(cat, '{invitation_id}', '103'), '{gifts,0,initial_quantity}', '100'), '{gifts,0,available_quantity}', '100')
      || jsonb_build_object('gift_id','gift-stable','quantity',1,'request_id', lpad(to_hex(i), 64, '0'),
        'guest', jsonb_build_object('name','Tamu ' || i,'whatsapp', '62811' || lpad(i::text, 7, '0')),'message', ''));
  end loop;
  r := public.api_dh_reservations(v_site, jsonb_build_object('invitation_id', 103, 'registry_id', 'registry-900-abc', 'offset', 0));
  if (r->>'total')::int <> 31 or jsonb_array_length(r->'reservations') <> 30 or (r->>'next_offset')::int <> 30 or jsonb_typeof(r->'next_offset') <> 'number'
    then raise exception 'ASSERT reservations page1: total=% len=% next=%', r->'total', jsonb_array_length(r->'reservations'), r->'next_offset'; end if; n := n + 1;
  r2 := public.api_dh_reservations(v_site, jsonb_build_object('invitation_id', 103, 'registry_id', 'registry-900-abc', 'offset', 30));
  if jsonb_array_length(r2->'reservations') <> 1 or jsonb_typeof(r2->'next_offset') <> 'null' then raise exception 'ASSERT page2: %', r2; end if; n := n + 1;
  if (r->'reservations'->0->>'timestamp') < (r->'reservations'->29->>'timestamp') then raise exception 'ASSERT newest first'; end if; n := n + 1;
  if r->'reservations'->0->'guest'->>'id' !~ '^guest-[a-f0-9]{64}$' or jsonb_typeof(r->'reservations'->0->'quantity') <> 'number' then raise exception 'ASSERT row shape: %', r->'reservations'->0; end if; n := n + 1;
  r := public.api_dh_reservations(v_site, jsonb_build_object('invitation_id', 999, 'registry_id', 'registry-900-abc', 'offset', 0));
  if r->'reservations' <> '[]'::jsonb or (r->>'total')::int <> 0 then raise exception 'ASSERT empty list []: %', r; end if; n := n + 1;
  r := public.api_dh_reservations(v_site2, jsonb_build_object('invitation_id', 103, 'registry_id', 'registry-900-abc', 'offset', 0));
  if (r->>'total')::int <> 0 then raise exception 'ASSERT reservations scoped by token website: %', r; end if; n := n + 1;

  -- ------------------------------------------------------------------ Form Order
  r := public.api_form_order_submit(v_site, jsonb_build_object('post_id',5,'post_title','Form Pesan','document_id',5,'element_id','order1',
       'request_id', repeat('7',64), 'fields', '{"groom_name":"Andi","bank_account":"0012345678","phone":"081200000000","addons":["musik","galeri"],"akad_date":"2026-12-01","akad_time":"08:30","custom_x":"nilai"}'::jsonb,
       'labels', '{"groom_name":"Nama Pria","bank_account":"Nomor Rekening","addons":"Tambahan"}'::jsonb));
  first_id := r->>'order_id'; first_ts := r->>'timestamp';
  if (select fields from public.form_orders where id = first_id::uuid)->>'bank_account' <> '0012345678'
     or jsonb_typeof((select fields from public.form_orders where id = first_id::uuid)->'addons') <> 'array'
     or (select fields from public.form_orders where id = first_id::uuid)->>'custom_x' <> 'nilai'
    then raise exception 'ASSERT jsonb preserves strings/arrays/custom fields'; end if; n := n + 1;
  r := public.api_form_order_submit(v_site, jsonb_build_object('post_id',5,'post_title','Form Pesan','document_id',5,'element_id','order1',
       'request_id', repeat('7',64), 'fields', '{"groom_name":"Andi","bank_account":"0012345678","phone":"081200000000","addons":["musik","galeri"],"akad_date":"2026-12-01","akad_time":"08:30","custom_x":"nilai"}'::jsonb,
       'labels', '{"groom_name":"Nama Pria"}'::jsonb));
  if r->>'order_id' <> first_id or r->>'timestamp' <> first_ts then raise exception 'ASSERT form order idempotent: %', r; end if; n := n + 1;
  if (select count(*) from public.form_orders where website_id = v_site) <> 1 then raise exception 'ASSERT no duplicate order'; end if; n := n + 1;
  err := null;
  begin perform public.api_form_order_submit(v_site, jsonb_build_object('post_id',5,'post_title','x','document_id',5,'element_id','order1',
       'request_id', repeat('7',64), 'fields', '{"groom_name":"Lain"}'::jsonb, 'labels', '{}'::jsonb));
  exception when others then err := sqlerrm; end;
  if err is distinct from 'request_conflict' then raise exception 'ASSERT form order conflict: %', err; end if; n := n + 1;

  -- ------------------------------------------------------------------ RLS
  insert into auth.users (id, email, aud, role) values
    (u_admin, 'admin-uji@example.invalid', 'authenticated', 'authenticated'),
    (u_a, 'pelanggan-a@example.invalid', 'authenticated', 'authenticated'),
    (u_b, 'pelanggan-b@example.invalid', 'authenticated', 'authenticated');
  if (select count(*) from public.profiles where id in (u_admin, u_a, u_b)) <> 3 then raise exception 'ASSERT profile trigger'; end if; n := n + 1;
  if (select count(*) from public.platform_admins where user_id in (u_admin, u_a, u_b)) <> 0 then raise exception 'ASSERT signup never admin'; end if; n := n + 1;
  insert into public.platform_admins (user_id) values (u_admin);
  insert into public.owner_mappings (website_id, external_owner_id, user_id) values (v_site, 'customer-102', u_a);
  insert into public.invitation_access (invitation_id, user_id)
    select id, u_b from public.invitations where website_id = v_site and wp_post_id = 103;

  -- Pelanggan A
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if (select count(*) from public.invitations) <> 1 or (select wp_post_id from public.invitations) <> 102 then raise exception 'ASSERT A sees only mapped invitation'; end if; n := n + 1;
  if (select count(*) from public.reservations) <> 1 then raise exception 'ASSERT A sees only own reservations'; end if; n := n + 1;
  if (select count(*) from public.form_orders) <> 0 then raise exception 'ASSERT customer cannot read form orders'; end if; n := n + 1;
  if (select count(*) from public.websites) <> 1 then raise exception 'ASSERT A sees only own website'; end if; n := n + 1;
  if (select count(*) from public.owner_mappings) <> 0 then raise exception 'ASSERT mappings hidden from customer'; end if; n := n + 1;
  if (select count(*) from public.website_tokens) <> 0 then raise exception 'ASSERT tokens hidden from customer'; end if; n := n + 1;
  if (select (public.my_registry_summary()->>'invitations')::int) <> 1 then raise exception 'ASSERT summary scoped'; end if; n := n + 1;
  err := null;
  begin insert into public.platform_admins (user_id) values (u_a); exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT cannot self-promote: %', err; end if; n := n + 1;
  err := null;
  begin insert into public.invitation_access (invitation_id, user_id) select id, u_a from public.invitations limit 1; exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT cannot claim invitation: %', err; end if; n := n + 1;
  err := null;
  begin update public.profiles set email = 'x@y.z' where id = u_a; exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT email column locked: %', err; end if; n := n + 1;
  update public.profiles set display_name = 'Pelanggan A' where id = u_a;
  update public.profiles set display_name = 'Hack' where id = u_b; -- tidak berdampak (RLS)
  err := null;
  begin perform public.admin_platform_summary(); exception when others then err := sqlerrm; end;
  if err is distinct from 'forbidden' then raise exception 'ASSERT customer cannot use admin summary: %', err; end if; n := n + 1;
  err := null;
  begin perform public.api_form_order_submit(v_site, '{}'::jsonb); exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT customer cannot execute integration RPC: %', err; end if; n := n + 1;
  err := null;
  begin perform token_hash from public.website_tokens; exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT token_hash column not readable: %', err; end if; n := n + 1;
  perform set_config('role', 'postgres', true);
  if (select display_name from public.profiles where id = u_b) = 'Hack' then raise exception 'ASSERT cannot edit other profile'; end if; n := n + 1;

  -- Pelanggan B (akses eksplisit undangan 103)
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if (select count(*) from public.invitations) <> 1 or (select wp_post_id from public.invitations) <> 103 then raise exception 'ASSERT B sees only granted invitation'; end if; n := n + 1;
  if (select count(*) from public.reservation_report where invitation_id not in (select id from public.invitations)) <> 0 then raise exception 'ASSERT view respects RLS'; end if; n := n + 1;
  perform set_config('role', 'postgres', true);

  -- owner null tidak memberi akses kepada siapa pun
  perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if exists (select 1 from public.invitations where owner_external_id is null) then raise exception 'ASSERT null owner grants nothing'; end if; n := n + 1;
  perform set_config('role', 'postgres', true);

  -- Admin
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if (select count(*) from public.form_orders) <> 1 then raise exception 'ASSERT admin reads form orders'; end if; n := n + 1;
  if (select count(*) from public.invitations) < 3 then raise exception 'ASSERT admin sees unowned invitations'; end if; n := n + 1;
  if (public.admin_platform_summary()->>'form_orders')::int <> 1 then raise exception 'ASSERT admin summary'; end if; n := n + 1;
  perform set_config('role', 'postgres', true);

  -- anon
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
  err := null;
  begin perform count(*) from public.form_orders; exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT anon denied form_orders: %', err; end if; n := n + 1;
  err := null;
  begin perform count(*) from public.invitations; exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT anon denied invitations: %', err; end if; n := n + 1;
  err := null;
  begin perform public.api_authenticate(h1, 'daftar_hadiah', sid1, url1, 100); exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT anon cannot call integration RPC: %', err; end if; n := n + 1;
  perform set_config('role', 'postgres', true);

  -- token revoked
  update public.website_tokens set revoked_at = now() where id = v_tok;
  r := public.api_authenticate(h1, 'daftar_hadiah', sid1, url1, 0);
  if (r->>'status')::int <> 401 then raise exception 'ASSERT revoked token 401: %', r; end if; n := n + 1;

  raise exception 'ALL_TESTS_PASSED (% assertions)', n;
end
$test$;
