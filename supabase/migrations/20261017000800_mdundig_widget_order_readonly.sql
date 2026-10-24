-- MDUNDIG: isi Order Undangan yang dikirim klien lewat widget bersifat hanya-lihat.
-- Admin tetap boleh mengubah status & catatan admin, dan menghapus order. Order input manual
-- (source = 'admin') tetap dapat diubah seluruhnya. Dikunci di database agar tidak bisa dilewati
-- lewat jalur mana pun (API dashboard maupun PostgREST langsung).

create or replace function private.form_orders_guard_widget_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source = 'widget' and (
    new.fields is distinct from old.fields
    or new.labels is distinct from old.labels
    or new.post_title is distinct from old.post_title
    or new.source is distinct from old.source
  ) then
    raise exception 'widget_order_readonly'
      using errcode = 'P0001',
            hint = 'Isi order dari widget hanya dapat dilihat; ubah status atau catatan admin.';
  end if;
  return new;
end;
$$;

revoke all on function private.form_orders_guard_widget_content() from public;

drop trigger if exists form_orders_guard_widget_content on public.form_orders;
create trigger form_orders_guard_widget_content
  before update on public.form_orders
  for each row execute function private.form_orders_guard_widget_content();
