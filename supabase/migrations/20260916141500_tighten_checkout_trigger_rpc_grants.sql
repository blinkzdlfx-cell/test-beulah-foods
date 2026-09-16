revoke all on function public.enforce_payment_amount_contract() from public;
revoke all on function public.enforce_active_reservation_window() from public;
revoke all on function public.expire_customer_reservation(uuid) from public;
grant execute on function public.expire_customer_reservation(uuid) to authenticated;