-- MDUNDIG — hapus undangan beserta isinya (reservasi, katalog, akses), satu atau banyak sekaligus.
-- Khusus admin platform, dalam satu transaksi. Non-destruktif terhadap skema.
create or replace function public.admin_invitations_delete(p_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
set lock_timeout = '5s'
as $$
declare
  v_reservations integer;
  v_invitations integer;
begin
  if not private.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'invalid_request'; end if;
  delete from public.reservations where invitation_id = any (p_ids);
  get diagnostics v_reservations = row_count;
  -- registries, gifts, invitation_access ikut terhapus (on delete cascade).
  delete from public.invitations where id = any (p_ids);
  get diagnostics v_invitations = row_count;
  insert into public.access_audit (actor_id, action, target, detail)
  values ((select auth.uid()), 'invitation.delete', left(array_to_string(p_ids, ','), 200),
          jsonb_build_object('invitations', v_invitations, 'reservations', v_reservations));
  return jsonb_build_object('invitations', v_invitations, 'reservations', v_reservations);
end;
$$;
revoke all on function public.admin_invitations_delete(uuid[]) from public, anon;
grant execute on function public.admin_invitations_delete(uuid[]) to authenticated;
