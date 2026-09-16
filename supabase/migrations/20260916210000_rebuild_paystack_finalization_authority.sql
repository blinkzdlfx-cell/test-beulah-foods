create or replace function public.prevent_payment_status_tampering()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $function$
begin
  if new.payment_status is distinct from old.payment_status
     and coalesce(auth.role(),'') <> 'service_role'
     and coalesce(current_setting('app.paystack_finalization', true), '') <> 'true' then
    raise exception 'PAYMENT_STATUS_TRUSTED_PATH_ONLY';
  end if;
  return new;
end;
$function$;

create or replace function public.finalize_paystack_payment(
  target_reference text,
  target_status text,
  target_amount_kobo bigint,
  target_raw_response jsonb,
  target_paid_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to public, pg_temp
as $function$
declare
  p record;
  o record;
  r record;
  i record;
  expected_kobo bigint;
  paid_amount bigint := target_amount_kobo;
  status_value text := lower(coalesce(target_status,''));
  finalized_at timestamptz := coalesce(target_paid_at, now());
  reservation_valid boolean := false;
begin
  perform set_config('app.paystack_finalization', 'true', true);

  if status_value not in ('success','failed') then raise exception 'INVALID_PAYMENT_STATUS'; end if;

  select * into p from public.payments where provider='paystack' and provider_reference=target_reference for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;

  expected_kobo := round(p.amount * 100)::bigint;
  if paid_amount is null or paid_amount <> expected_kobo then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;

  select * into o from public.orders where id=p.order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;

  select * into r from public.reservations where order_id=o.id order by created_at desc limit 1 for update;

  if p.status='successful' then
    return jsonb_build_object('order_id',o.id,'payment_status','successful','already_finalized',true,'transitioned',false,'late_payment',coalesce(p.late_payment,false),'manual_resolution_required',coalesce(p.manual_resolution_required,false));
  end if;

  reservation_valid := r.id is not null and r.status='active' and r.expires_at>now();

  if status_value='success' then
    if not reservation_valid then
      update public.payments set status='successful',late_payment=true,manual_resolution_required=true,raw_response=target_raw_response,paid_at=finalized_at,updated_at=now() where id=p.id;
      return jsonb_build_object('order_id',o.id,'payment_status','successful','late_payment',true,'manual_resolution_required',true,'transitioned',true);
    end if;

    for i in select product_id,quantity from public.order_items where order_id=o.id and product_id is not null loop
      update public.products set stock_quantity=stock_quantity-i.quantity,reserved_quantity=greatest(0,reserved_quantity-i.quantity),updated_at=now() where id=i.product_id and stock_quantity>=i.quantity and reserved_quantity>=i.quantity;
      if not found then raise exception 'INVENTORY_FINALIZATION_FAILED'; end if;
    end loop;

    update public.payments set status='successful',late_payment=false,manual_resolution_required=false,raw_response=target_raw_response,paid_at=finalized_at,updated_at=now() where id=p.id;
    update public.orders set payment_status='successful',status='paid',updated_at=now() where id=o.id;
    update public.reservations set status='confirmed',updated_at=now() where id=r.id and status='active';

    if o.promo_code is not null and not coalesce(o.promo_usage_consumed,false) then
      update public.promo_codes set usage_count=usage_count+1,updated_at=now() where code=o.promo_code;
      update public.orders set promo_usage_consumed=true,updated_at=now() where id=o.id;
    end if;

    return jsonb_build_object('order_id',o.id,'payment_status','successful','status','paid','transitioned',true,'late_payment',false,'manual_resolution_required',false);
  end if;

  update public.payments set status='failed',late_payment=false,manual_resolution_required=false,raw_response=target_raw_response,updated_at=now() where id=p.id;

  if r.id is not null and r.status='active' then
    update public.reservations set status=case when expires_at<=now() then 'expired' else 'cancelled' end,updated_at=now() where id=r.id and status='active';
    for i in select product_id,quantity from public.order_items where order_id=o.id and product_id is not null loop
      update public.products set reserved_quantity=greatest(0,reserved_quantity-i.quantity),updated_at=now() where id=i.product_id;
    end loop;
  end if;

  update public.orders set payment_status='failed',status='cancelled',updated_at=now() where id=o.id and payment_status='pending';
  return jsonb_build_object('order_id',o.id,'payment_status','failed','status','cancelled','transitioned',true);
end;
$function$;

revoke execute on function public.finalize_paystack_payment(text,text,bigint,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.finalize_paystack_payment(text,text,bigint,jsonb,timestamptz) to service_role;
