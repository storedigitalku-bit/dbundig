-- MDUNDIG: info sesi untuk server — peran admin + verifikasi dua langkah (TOTP, Supabase MFA).
-- Akun yang sudah mengaktifkan verifikasi dua langkah WAJIB memakai sesi aal2; tanpa itu semua API menolak
-- (diperiksa di server, bukan hanya di tampilan). Akun tanpa faktor terverifikasi tidak terpengaruh.
create or replace function public.session_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'is_admin', exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid())),
    'mfa_enrolled', exists (select 1 from auth.mfa_factors f where f.user_id = (select auth.uid()) and f.status = 'verified'),
    'aal', coalesce((select auth.jwt()) ->> 'aal', 'aal1')
  )
$$;
revoke all on function public.session_info() from public, anon;
grant execute on function public.session_info() to authenticated;
