-- MDUNDIG: indeks untuk foreign key "dibuat/dicabut oleh" (saran Supabase performance advisor).
-- Mempercepat penghapusan akun (ON DELETE SET NULL / CASCADE memindai kolom-kolom ini) dan audit per pelaku.
create index if not exists access_audit_actor_idx on public.access_audit (actor_id);
create index if not exists invitation_access_granted_by_idx on public.invitation_access (granted_by);
create index if not exists owner_mappings_created_by_idx on public.owner_mappings (created_by);
create index if not exists website_tokens_created_by_idx on public.website_tokens (created_by);
create index if not exists website_tokens_replaced_by_idx on public.website_tokens (replaced_by);
create index if not exists website_tokens_revoked_by_idx on public.website_tokens (revoked_by);
create index if not exists websites_created_by_idx on public.websites (created_by);
