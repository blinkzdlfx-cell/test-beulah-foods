-- Remove inherited PUBLIC EXECUTE privileges from SECURITY DEFINER functions.
-- Explicitly grant only the roles that need each RPC.

REVOKE EXECUTE ON FUNCTION public.provision_admin(uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.provision_admin(uuid, text)
TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_expired_reservations()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.release_expired_reservations()
TO service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_two_open_reservations()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_two_open_reservations()
TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_customer()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_customer()
TO service_role;

REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rls_auto_enable()
TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_update_order_status(uuid, text)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_pending_order(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cancel_pending_order(uuid)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_pending_order(
  jsonb,
  text,
  text,
  text,
  text
)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_pending_order(
  jsonb,
  text,
  text,
  text,
  text
)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_customer_cart()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_customer_cart()
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.merge_customer_cart(jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.merge_customer_cart(jsonb)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_customer_cart(jsonb)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_customer_cart(jsonb)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.retry_expired_pending_order(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.retry_expired_pending_order(uuid)
TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_admin(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_admin(uuid)
TO authenticated, service_role;
