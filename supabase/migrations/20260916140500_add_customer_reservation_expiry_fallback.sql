-- Customer-side fallback only: the database remains authoritative.
-- The scheduler remains the global expiration mechanism.

create or replace function public.expire_customer_reservation(target_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  customer uuid := auth.uid();
  order_row record;
  reservation_row record;
  item_row record;
  transitioned integer;
begin
  if customer is null then raise exception 'AUTH_REQUIRED'; end if;

  select id,customer_id,status,payment_status
    into order_row
    from public.orders
   where id=target_order_id
   for update;
  if not found or order_row.customer_id<>customer then raise exception 'ORDER_NOT_FOUND'; end if;

  select id,status,expires_at
    into reservation_row
    from public.reservations
   where order_id=target_order_id
   for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;

  if reservation_row.status='active' and reservation_row.expires_at<=now() then
    update public.reservations
       set status='expired',updated_at=now()
     where id=reservation_row.id and status='active' and expires_at<=now();
    get diagnostics transitioned=row_count;

    if transitioned then
      for item_row in
        select product_id,quantity
        from public.order_items
        where order_id=target_order_id and product_id is not null
      loop
        update public.products
           set reserved_quantity=greatest(0,reserved_quantity-item_row.quantity),updated_at=now()
         where id=item_row.product_id;
      end loop;

      update public.orders
         set status='cancelled',updated_at=now()
       where id=target_order_id and payment_status='pending' and status='pending_payment';

      return jsonb_build_object('order_id',target_order_id,'status','expired','released',true);
    end if;
  end if;

  return jsonb_build_object('order_id',target_order_id,'status',reservation_row.status,'released',false,'expires_at',reservation_row.expires_at);
end;
$function$;

revoke all on function public.expire_customer_reservation(uuid) from public;
grant execute on function public.expire_customer_reservation(uuid) to authenticated;