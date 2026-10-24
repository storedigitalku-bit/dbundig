-- Uji live CRUD admin (connector Supabase). Seluruh data uji di-rollback; data nyata tidak disentuh.
-- Hasil yang diharapkan: error "ALL_TESTS_PASSED (<n> assertions)".
do $test$
declare
  n integer := 0; err text; v_site uuid; v_gift uuid; v_res uuid; v_res2 uuid; v_order uuid; v_inv uuid; v_tok uuid; cnt integer;
  u_admin uuid := gen_random_uuid(); u_c uuid := gen_random_uuid();
begin
  insert into public.websites (name, site_url, external_site_id) values ('UJI CRUD', 'https://uji-crud.mdundig.invalid/', 'site-' || repeat('9', 32)) returning id into v_site;
  perform public.api_dh_catalog(v_site, jsonb_build_object('website_id','site-' || repeat('9',32),'invitation_id',1,'invitation_title','Uji CRUD',
    'registry_id','registry-1-crud','document_id',1,'element_id','crud','catalog_version','1760000000001','catalog_hash',repeat('a',64),'owner_id',null,
    'gifts', jsonb_build_array(jsonb_build_object('gift_id','gift-solo','name','Hadiah 1','description','','image_url','','purchase_url','','initial_quantity',1,'available_quantity',1,'availability','available'))));
  select id, invitation_id into v_gift, v_inv from public.gifts where registry_id in (select id from public.registries where registry_key = 'registry-1-crud' and invitation_id in (select id from public.invitations where website_id = v_site));
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (u_admin, 'crud-admin@akun.mdundig.invalid', 'authenticated', 'authenticated', '{"username":"crud-admin"}'),
    (u_c, 'crud-cust@akun.mdundig.invalid', 'authenticated', 'authenticated', '{"username":"crud-cust"}');
  insert into public.platform_admins (user_id) values (u_admin);

  -- sebagai admin
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_res := public.admin_reservation_create(v_gift, 'Budi', '6281234567890', 'Telepon', 'catatan');
  if (select available_quantity from public.gift_stock where id = v_gift) <> 0 then raise exception 'ASSERT stock after create'; end if; n := n + 1;
  err := null; begin perform public.admin_reservation_create(v_gift, 'Sari', '6280000000001', '', ''); exception when others then err := sqlerrm; end;
  if err is distinct from 'gift_unavailable' then raise exception 'ASSERT no oversell: %', err; end if; n := n + 1;
  perform public.admin_reservation_update(v_res, 'Budi S', '6281234567890', '', 'cancelled', '');
  if (select available_quantity from public.gift_stock where id = v_gift) <> 1 then raise exception 'ASSERT cancel restores stock'; end if; n := n + 1;
  v_res2 := public.admin_reservation_create(v_gift, 'Sari', '6280000000001', '', '');
  err := null; begin perform public.admin_reservation_update(v_res, 'Budi S', '6281234567890', '', 'confirmed', ''); exception when others then err := sqlerrm; end;
  if err is distinct from 'gift_unavailable' then raise exception 'ASSERT reactivate blocked when full: %', err; end if; n := n + 1;
  perform public.admin_reservation_delete(v_res2);
  if (select available_quantity from public.gift_stock where id = v_gift) <> 1 then raise exception 'ASSERT delete restores stock'; end if; n := n + 1;
  if (select source from public.reservation_report where id = v_res) <> 'admin' then raise exception 'ASSERT source in view'; end if; n := n + 1;

  insert into public.form_orders (website_id, request_id, payload_hash, post_title, fields, labels, status, admin_note, source)
  values (v_site, repeat('e', 64), repeat('e', 64), 'Order manual', '{"nama":"Andi"}', '{"nama":"Nama"}', 'baru', '', 'admin') returning id into v_order;
  update public.form_orders set status = 'selesai', admin_note = 'ok' where id = v_order;
  if (select status from public.form_orders where id = v_order) <> 'selesai' then raise exception 'ASSERT order update'; end if; n := n + 1;
  err := null; begin update public.form_orders set payload_hash = 'x' where id = v_order; exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT payload_hash locked: %', err; end if; n := n + 1;
  err := null; begin delete from public.invitations where id = v_inv; exception when others then err := sqlstate; end;
  if err is distinct from '23503' then raise exception 'ASSERT invitation with reservations protected: %', err; end if; n := n + 1;
  perform set_config('role', 'postgres', true);

  insert into public.website_tokens (website_id, token_hash, scopes) values (v_site, repeat('7', 64), array['daftar_hadiah']) returning id into v_tok;

  -- sebagai pelanggan
  perform set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  err := null; begin perform public.admin_reservation_delete(v_res); exception when others then err := sqlerrm; end;
  if err is distinct from 'forbidden' then raise exception 'ASSERT customer cannot delete reservation: %', err; end if; n := n + 1;
  err := null; begin perform public.admin_reservation_create(v_gift, 'X', '6289999999999', '', ''); exception when others then err := sqlerrm; end;
  if err is distinct from 'forbidden' then raise exception 'ASSERT customer cannot create reservation: %', err; end if; n := n + 1;
  delete from public.form_orders where id = v_order; get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'ASSERT customer cannot delete order'; end if; n := n + 1;
  err := null; begin insert into public.form_orders (website_id, request_id, payload_hash, fields, labels, source) values (v_site, repeat('f', 64), repeat('f', 64), '{}', '{}', 'admin'); exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT customer cannot insert order: %', err; end if; n := n + 1;
  delete from public.website_tokens where id = v_tok; get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'ASSERT customer cannot delete token'; end if; n := n + 1;
  perform set_config('role', 'postgres', true);

  -- admin: token aktif tidak terhapus, token dicabut terhapus
  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  delete from public.website_tokens where id = v_tok; get diagnostics cnt = row_count;
  if cnt <> 0 then raise exception 'ASSERT active token not deletable'; end if; n := n + 1;
  update public.website_tokens set revoked_at = now(), revoked_by = u_admin where id = v_tok;
  delete from public.website_tokens where id = v_tok; get diagnostics cnt = row_count;
  if cnt <> 1 then raise exception 'ASSERT revoked token deletable'; end if; n := n + 1;
  delete from public.form_orders where id = v_order; get diagnostics cnt = row_count;
  if cnt <> 1 then raise exception 'ASSERT admin deletes order'; end if; n := n + 1;
  perform set_config('role', 'postgres', true);

  raise exception 'ALL_TESTS_PASSED (% assertions)', n;
end
$test$;
