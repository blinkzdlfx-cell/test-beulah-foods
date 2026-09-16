-- TEST-only coordinated checkout/payment state-machine rebuild.
-- Historical rows are intentionally not rewritten.

create extension if not exists pg_cron;

alter table public.payments
  add column if not exists late_payment boolean not null default false,
  add column if not exists manual_resolution_required boolean not null default false;

comment on column public.payments.amount is 'Payment amount in NGN. Paystack API amounts are NGN * 100 (kobo).';
comment on column public.payments.late_payment is 'Paystack success received after the reservation was no longer valid.';
comment on column public.payments.manual_resolution_required is 'Successful payment requires manual handling because inventory/order state cannot be safely finalized automatically.';

create or replace function public.enforce_active_reservation_window()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
begin
  if new.status = 'active' and new.expires_at <= now() then
    raise exception 'RESERVATION_ALREADY_EXPIRED';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_active_reservation_window on public.reservations;
create trigger enforce_active_reservation_window
before insert or update of status, expires_at on public.reservations
for each row execute function public.enforce_active_reservation_window();

create or replace function public.enforce_payment_amount_contract()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare expected_amount numeric;
begin
  select total into expected_amount from public.orders where id = new.order_id;
  if expected_amount is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if new.amount is distinct from expected_amount then
    raise exception 'PAYMENT_AMOUNT_MUST_EQUAL_ORDER_TOTAL_NGN';
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_payment_amount_contract on public.payments;
create trigger enforce_payment_amount_contract
before insert or update of order_id, amount on public.payments
for each row execute function public.enforce_payment_amount_contract();

create or replace function public.release_expired_reservations()
returns integer language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  released integer := 0;
  reservation_row record;
  item_row record;
  transitioned integer;
begin
  for reservation_row in
    select r.id, r.order_id
    from public.reservations r
    where r.status = 'active' and r.expires_at <= now()
    for update
  loop
    update public.reservations
       set status = 'expired', updated_at = now()
     where id = reservation_row.id
       and status = 'active'
       and expires_at <= now();
    get diagnostics transitioned = row_count;

    if transitioned then
      for item_row in
        select product_id, quantity
        from public.order_items
        where order_id = reservation_row.order_id and product_id is not null
      loop
        update public.products
           set reserved_quantity = greatest(0, reserved_quantity - item_row.quantity),
               updated_at = now()
         where id = item_row.product_id;
      end loop;

      update public.orders
         set status = 'cancelled', updated_at = now()
       where id = reservation_row.order_id
         and payment_status = 'pending'
         and status = 'pending_payment';

      released := released + 1;
    end if;
  end loop;
  return released;
end;
$function$;

create or replace function public.enforce_two_open_reservations()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare customer uuid; open_reservations integer := 0;
begin
  select customer_id into customer from public.orders where id = new.order_id;
  if customer is null then raise exception 'ORDER_CUSTOMER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(customer::text, 0));
  perform public.release_expired_reservations();
  select count(*)::integer into open_reservations
  from public.reservations r
  join public.orders o on o.id = r.order_id
  where o.customer_id = customer
    and o.payment_status = 'pending'
    and o.status = 'pending_payment'
    and r.status = 'active'
    and r.expires_at > now();
  if open_reservations >= 2 then raise exception 'MAX_OPEN_RESERVATIONS_REACHED'; end if;
  return new;
end;
$function$;

create or replace function public.create_pending_order(cart_items jsonb, delivery_name text, delivery_phone text, delivery_address text, requested_promo_code text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  customer uuid := auth.uid();
  v_order_id uuid; reservation_id uuid; attempt_number integer; item jsonb; product_row record; promo_row record; delivery_row record;
  requested_quantity integer; available_quantity integer;
  v_subtotal numeric(12,2) := 0; v_delivery_fee numeric(12,2) := 0; v_discount numeric(12,2) := 0; v_total numeric(12,2) := 0;
  item_total numeric(12,2); v_expires_at timestamptz;
  v_delivery_enabled boolean := false; v_free_delivery_enabled boolean := false;
  v_promo_code text; v_promo_discount_type text; v_promo_discount_value numeric(12,2); v_promo_minimum_order numeric(12,2); v_promo_maximum_discount numeric(12,2);
  normalized_promo text := nullif(lower(trim(coalesce(requested_promo_code,''))), '');
begin
  if customer is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(trim(delivery_name),'') is null or nullif(trim(delivery_phone),'') is null or nullif(trim(delivery_address),'') is null then raise exception 'DELIVERY_DETAILS_REQUIRED'; end if;
  if jsonb_typeof(cart_items) <> 'array' or jsonb_array_length(cart_items) = 0 then raise exception 'CART_EMPTY'; end if;

  perform pg_advisory_xact_lock(hashtextextended(customer::text, 0));
  perform public.release_expired_reservations();

  select delivery_fee, free_delivery_threshold, is_delivery_enabled, is_free_delivery_enabled
    into delivery_row from public.delivery_settings where is_active = true order by updated_at desc limit 1;
  if found then
    v_delivery_enabled := coalesce(delivery_row.is_delivery_enabled, false);
    v_free_delivery_enabled := coalesce(delivery_row.is_free_delivery_enabled, false);
    if v_delivery_enabled and delivery_row.delivery_fee is null then raise exception 'DELIVERY_CONFIGURATION_INVALID'; end if;
    if v_free_delivery_enabled and delivery_row.free_delivery_threshold is null then raise exception 'DELIVERY_CONFIGURATION_INVALID'; end if;
  end if;

  if (select count(*) from public.reservations r join public.orders o on o.id = r.order_id where o.customer_id = customer and o.payment_status = 'pending' and o.status = 'pending_payment' and r.status = 'active' and r.expires_at > now()) >= 2 then
    raise exception 'MAX_OPEN_RESERVATIONS_REACHED';
  end if;

  insert into public.orders(customer_id,status,payment_status,delivery_name,delivery_phone,delivery_address)
  values(customer,'pending_payment','pending',trim(delivery_name),trim(delivery_phone),trim(delivery_address)) returning id into v_order_id;

  for item in select * from jsonb_array_elements(cart_items) loop
    requested_quantity := (item->>'quantity')::integer;
    if requested_quantity is null or requested_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
    select id,name,price,stock_quantity,reserved_quantity,is_active into product_row from public.products where id = (item->>'productId')::uuid for update;
    if not found or not product_row.is_active then raise exception 'PRODUCT_UNAVAILABLE:%', item->>'productId'; end if;
    available_quantity := greatest(0, product_row.stock_quantity - product_row.reserved_quantity);
    if available_quantity < requested_quantity then raise exception 'INSUFFICIENT_STOCK:%', product_row.name; end if;
    item_total := round(product_row.price * requested_quantity, 2);
    v_subtotal := v_subtotal + item_total;
    insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total)
    values(v_order_id,product_row.id,product_row.name,product_row.price,requested_quantity,item_total);
    update public.products set reserved_quantity = reserved_quantity + requested_quantity, updated_at = now() where id = product_row.id;
  end loop;

  if v_delivery_enabled then
    v_delivery_fee := delivery_row.delivery_fee;
    if v_free_delivery_enabled and v_subtotal >= delivery_row.free_delivery_threshold then v_delivery_fee := 0; end if;
  end if;

  if normalized_promo is not null then
    select * into promo_row from public.promo_codes where lower(code) = normalized_promo and is_active = true and (starts_at is null or starts_at <= now()) and (expires_at is null or expires_at >= now()) and (usage_limit is null or usage_count < usage_limit) for update;
    if not found then raise exception 'PROMO_INVALID'; end if;
    if v_subtotal < promo_row.minimum_order_amount then raise exception 'PROMO_MINIMUM_NOT_MET:%', promo_row.minimum_order_amount; end if;
    v_promo_code := promo_row.code; v_promo_discount_type := promo_row.discount_type; v_promo_discount_value := promo_row.discount_value; v_promo_minimum_order := promo_row.minimum_order_amount; v_promo_maximum_discount := promo_row.maximum_discount_amount;
    if promo_row.discount_type = 'percentage' then
      v_discount := round(v_subtotal * promo_row.discount_value / 100, 2);
      if promo_row.maximum_discount_amount is not null then v_discount := least(v_discount, promo_row.maximum_discount_amount); end if;
    else v_discount := least(promo_row.discount_value, v_subtotal); end if;
  end if;

  v_total := greatest(0, round(v_subtotal + v_delivery_fee - v_discount, 2));
  v_expires_at := now() + interval '15 minutes';
  update public.orders set subtotal=v_subtotal, fees=v_delivery_fee, delivery_fee=v_delivery_fee, discount_amount=v_discount, promo_code=v_promo_code, promo_discount_type=v_promo_discount_type, promo_discount_value=v_promo_discount_value, promo_minimum_order=v_promo_minimum_order, promo_maximum_discount=v_promo_maximum_discount, promo_usage_consumed=false, total=v_total, updated_at=now() where id=v_order_id;
  insert into public.reservations(order_id,status,expires_at) values(v_order_id,'active',v_expires_at) returning id into reservation_id;
  select coalesce(max(p2.attempt_number),0) + 1 into attempt_number from public.payments p2 where p2.order_id = v_order_id;
  insert into public.payments(order_id,provider,status,amount,attempt_number) values(v_order_id,'paystack','pending',v_total,attempt_number);
  return jsonb_build_object('order_id',v_order_id,'reservation_id',reservation_id,'payment_attempt_number',attempt_number,'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'discount',v_discount,'total',v_total,'promo_code',v_promo_code,'expires_at',v_expires_at);
end;
$function$;

create or replace function public.cancel_pending_order(target_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare customer uuid := auth.uid(); order_row record; reservation_row record; item_row record; final_reservation_status text;
begin
  if customer is null then raise exception 'AUTH_REQUIRED'; end if;
  select id,customer_id,status,payment_status into order_row from public.orders where id = target_order_id for update;
  if not found or order_row.customer_id <> customer then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.payment_status <> 'pending' or order_row.status <> 'pending_payment' then
    if order_row.status='cancelled' and order_row.payment_status='pending' then return jsonb_build_object('order_id',order_row.id,'status','cancelled','already_cancelled',true); end if;
    raise exception 'ORDER_NOT_CANCELLABLE';
  end if;
  select id,status,expires_at into reservation_row from public.reservations where order_id = order_row.id for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if reservation_row.status = 'active' then
    final_reservation_status := case when reservation_row.expires_at <= now() then 'expired' else 'cancelled' end;
    update public.reservations set status=final_reservation_status, updated_at=now() where id=reservation_row.id and status='active';
    for item_row in select product_id,quantity from public.order_items where order_id=order_row.id and product_id is not null loop
      update public.products set reserved_quantity=greatest(0,reserved_quantity-item_row.quantity),updated_at=now() where id=item_row.product_id;
    end loop;
    update public.orders set status='cancelled',updated_at=now() where id=order_row.id;
    return jsonb_build_object('order_id',order_row.id,'status','cancelled','reservation_status',final_reservation_status,'stock_released',true);
  end if;
  if reservation_row.status in ('expired','cancelled') then
    update public.orders set status='cancelled',updated_at=now() where id=order_row.id;
    return jsonb_build_object('order_id',order_row.id,'status','cancelled','reservation_status',reservation_row.status,'stock_released',false);
  end if;
  raise exception 'ORDER_NOT_CANCELLABLE';
end;
$function$;

create or replace function public.retry_expired_pending_order(target_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare customer uuid := auth.uid(); order_row record; reservation_row record; item_row record; released boolean := false;
begin
  if customer is null then raise exception 'AUTH_REQUIRED'; end if;
  select id,customer_id,status,payment_status into order_row from public.orders where id=target_order_id for update;
  if not found or order_row.customer_id<>customer then raise exception 'ORDER_NOT_FOUND'; end if;
  if order_row.payment_status<>'pending' then raise exception 'ORDER_NOT_RETRYABLE'; end if;
  if order_row.status not in ('pending_payment','cancelled') then raise exception 'ORDER_NOT_RETRYABLE'; end if;
  select id,status,expires_at into reservation_row from public.reservations where order_id=target_order_id for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if reservation_row.status='active' and reservation_row.expires_at>now() then raise exception 'RESERVATION_STILL_ACTIVE'; end if;
  if reservation_row.status='active' then
    update public.reservations set status='expired',updated_at=now() where id=reservation_row.id and status='active' and expires_at<=now();
    if found then
      for item_row in select product_id,quantity from public.order_items where order_id=target_order_id and product_id is not null loop
        update public.products set reserved_quantity=greatest(0,reserved_quantity-item_row.quantity),updated_at=now() where id=item_row.product_id;
      end loop;
      released:=true;
    end if;
  elsif reservation_row.status not in ('expired','cancelled') then raise exception 'ORDER_NOT_RETRYABLE'; end if;
  update public.orders set status='cancelled',updated_at=now() where id=target_order_id and payment_status='pending';
  return jsonb_build_object('order_id',target_order_id,'status','cancelled','reservation_released',released,'next_step','create_new_pending_order');
end;
$function$;

create or replace function public.finalize_paystack_payment(target_reference text,target_status text,target_amount_kobo bigint,target_raw_response jsonb,target_paid_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $function$
declare p record; o record; r record; i record; expected_kobo bigint; s text:=lower(target_status);
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'TRUSTED_PAYMENT_PATH_ONLY'; end if;
  if s not in ('success','failed') then raise exception 'INVALID_PAYMENT_STATUS'; end if;
  select * into p from public.payments where provider='paystack' and provider_reference=target_reference for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  expected_kobo := round(p.amount*100)::bigint;
  if target_amount_kobo is not null and target_amount_kobo <> expected_kobo then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  select * into o from public.orders where id=p.order_id for update;
  select * into r from public.reservations where order_id=o.id order by created_at desc limit 1 for update;

  if p.status='successful' then
    return jsonb_build_object('order_id',o.id,'payment_status','successful','already_finalized',true,'transitioned',false,'late_payment',p.late_payment,'manual_resolution_required',p.manual_resolution_required);
  end if;

  if s='success' then
    if r.id is null or r.status<>'active' or r.expires_at<=now() then
      update public.payments set status='successful',late_payment=true,manual_resolution_required=true,raw_response=target_raw_response,paid_at=coalesce(target_paid_at,paid_at),updated_at=now() where id=p.id;
      return jsonb_build_object('order_id',o.id,'payment_status','successful','late_payment',true,'manual_resolution_required',true,'transitioned',true);
    end if;

    for i in select product_id,quantity from public.order_items where order_id=o.id and product_id is not null loop
      update public.products set stock_quantity=stock_quantity-i.quantity,reserved_quantity=greatest(0,reserved_quantity-i.quantity),updated_at=now() where id=i.product_id and stock_quantity>=i.quantity and reserved_quantity>=i.quantity;
      if not found then raise exception 'INVENTORY_FINALIZATION_FAILED'; end if;
    end loop;

    update public.payments set status='successful',late_payment=false,manual_resolution_required=false,raw_response=target_raw_response,paid_at=coalesce(target_paid_at,paid_at),updated_at=now() where id=p.id;
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

select cron.unschedule(jobid) from cron.job where jobname='beulah-release-expired-reservations';
select cron.schedule('beulah-release-expired-reservations','*/5 * * * *',$cron$select public.release_expired_reservations();$cron$);