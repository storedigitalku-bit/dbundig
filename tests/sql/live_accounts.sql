-- Uji live akun username (dijalankan via connector Supabase). Semua data di-rollback.
-- Hasil yang diharapkan: error "ALL_TESTS_PASSED (12 assertions)".
do $test$
declare
  n integer := 0; err text; ok boolean;
  u_admin uuid := gen_random_uuid(); u_c uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (u_admin, 'admin@akun.mdundig.invalid', 'authenticated', 'authenticated', '{"username":"admin","display_name":"Admin"}'),
    (u_c, 'pelanggan1@akun.mdundig.invalid', 'authenticated', 'authenticated', '{"username":"Pelanggan1"}');
  if (select username from public.profiles where id = u_admin) <> 'admin' then raise exception 'ASSERT username from metadata'; end if; n := n + 1;
  if (select username from public.profiles where id = u_c) <> 'pelanggan1' then raise exception 'ASSERT username lowercased'; end if; n := n + 1;
  if exists (select 1 from public.platform_admins where user_id in (u_admin, u_c)) then raise exception 'ASSERT no auto admin'; end if; n := n + 1;

  perform public.bootstrap_platform_admin('admin@akun.mdundig.invalid', 'admin');
  if not exists (select 1 from public.platform_admins where user_id = u_admin) then raise exception 'ASSERT bootstrap admin'; end if; n := n + 1;

  err := null;
  begin update public.profiles set username = 'admin' where id = u_c; exception when others then err := sqlstate; end;
  if err is distinct from '23505' then raise exception 'ASSERT username unique: %', err; end if; n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  err := null;
  begin update public.profiles set username = 'bos' where id = u_c; exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT customer cannot change username: %', err; end if; n := n + 1;
  err := null;
  begin perform public.bootstrap_platform_admin('pelanggan1@akun.mdundig.invalid', 'x'); exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT customer cannot bootstrap: %', err; end if; n := n + 1;
  err := null;
  begin perform public.api_login_attempt('login:' || repeat('a', 64), 3); exception when others then err := sqlstate; end;
  if err is distinct from '42501' then raise exception 'ASSERT customer cannot call login throttle: %', err; end if; n := n + 1;
  if exists (select 1 from public.profiles where id = u_admin) then raise exception 'ASSERT customer cannot read other profiles'; end if; n := n + 1;
  perform set_config('role', 'postgres', true);

  perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  if (select count(*) from public.profiles where id in (u_admin, u_c)) <> 2 then raise exception 'ASSERT admin lists accounts'; end if; n := n + 1;
  perform set_config('role', 'postgres', true);

  ok := public.api_login_attempt('login:' || repeat('b', 64), 2);
  ok := public.api_login_attempt('login:' || repeat('b', 64), 2);
  if not ok then raise exception 'ASSERT throttle allows 2'; end if; n := n + 1;
  ok := public.api_login_attempt('login:' || repeat('b', 64), 2);
  if ok then raise exception 'ASSERT throttle blocks 3rd'; end if; n := n + 1;

  raise exception 'ALL_TESTS_PASSED (% assertions)', n;
end
$test$;
