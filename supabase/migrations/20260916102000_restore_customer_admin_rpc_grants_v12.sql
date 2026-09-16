begin;

-- These SECURITY DEFINER functions are intentionally callable by signed-in
-- customers/admins. Their bodies enforce ownership/role checks with auth.uid().
grant execute on function public.cancel_pending_order(uuid) to authenticated;
grant execute on function public.retry_expired_pending_order(uuid) to authenticated;
grant execute on function public.admin_update_order_status(uuid, text) to authenticated;

-- RLS SELECT policies call is_admin() directly, so authenticated must be able
-- to execute this boolean helper. The function itself only checks admin_users.
grant execute on function public.is_admin(uuid) to authenticated;

commit;
