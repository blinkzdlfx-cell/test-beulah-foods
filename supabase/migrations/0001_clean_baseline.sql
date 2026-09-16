-- Beulah Foods clean staging baseline
-- This is a new foundation. Historical production migrations are reference only.
-- Apply to an empty staging database only.

create extension if not exists pgcrypto;

create sequence public.beulah_order_number_seq start 1;

create table public.customer_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  slug text not null unique,
  description text,
  price numeric(12,2) not null check (price >= 0),
  image_url text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reserved_quantity integer not null default 0 check (reserved_quantity >= 0),
  constraint products_stock_covers_reservations check (stock_quantity >= reserved_quantity)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending_payment' check (status in ('pending_payment','paid','processing','completed','cancelled')),
  payment_status text not null default 'pending' check (payment_status in ('pending','successful','failed')),
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  fees numeric(12,2) not null default 0 check (fees >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  delivery_name text not null,
  delivery_phone text not null,
  delivery_address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  promo_code text,
  promo_discount_type text,
  promo_discount_value numeric(12,2),
  promo_minimum_order numeric(12,2),
  promo_maximum_discount numeric(12,2),
  order_number text not null default ('BF-' || nextval('public.beulah_order_number_seq')) unique
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status text not null default 'active' check (status in ('active','expired','confirmed','cancelled')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider text,
  provider_reference text,
  status text not null default 'pending' check (status in ('pending','successful','failed')),
  amount numeric(12,2) not null check (amount >= 0),
  raw_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.delivery_settings (
  id uuid primary key default gen_random_uuid(),
  delivery_fee numeric(12,2) check (delivery_fee is null or delivery_fee >= 0),
  free_delivery_threshold numeric(12,2) check (free_delivery_threshold is null or free_delivery_threshold >= 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_delivery_enabled boolean not null default false,
  is_free_delivery_enabled boolean not null default false
);

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  discount_type text not null check (discount_type in ('percentage','fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_order_amount numeric(12,2) not null default 0 check (minimum_order_amount >= 0),
  maximum_discount_amount numeric(12,2) check (maximum_discount_amount is null or maximum_discount_amount > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  usage_count integer not null default 0 check (usage_count >= 0),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customer_cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.customer_carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_id)
);

create unique index payments_provider_reference_uidx on public.payments(provider_reference) where provider_reference is not null;
create index orders_customer_id_idx on public.orders(customer_id);
create index orders_status_idx on public.orders(status);
create index order_items_order_id_idx on public.order_items(order_id);
create index payments_order_id_idx on public.payments(order_id);
create index reservations_expires_at_idx on public.reservations(expires_at);
create index products_active_idx on public.products(is_active);
create index products_category_id_idx on public.products(category_id);
create index products_available_stock_idx on public.products(stock_quantity, reserved_quantity);
create index categories_active_idx on public.categories(is_active);
create index customer_cart_items_cart_id_idx on public.customer_cart_items(cart_id);
create index customer_cart_items_product_id_idx on public.customer_cart_items(product_id);
create unique index delivery_settings_one_active_idx on public.delivery_settings(is_active) where is_active = true;
create unique index promo_codes_code_lower_idx on public.promo_codes(lower(code));
create unique index promo_codes_one_active_code_idx on public.promo_codes(lower(code)) where is_active = true;

create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = target_user_id);
$$;

create or replace function public.set_customer_profile_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create or replace function public.prevent_payment_status_tampering()
returns trigger language plpgsql as $$
begin
  if new.payment_status is distinct from old.payment_status and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'PAYMENT_STATUS_TRUSTED_PATH_ONLY';
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_customer()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.customer_profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.release_expired_reservations()
returns integer language plpgsql security definer set search_path = public as $$
declare released integer := 0; reservation_row record; item_row record;
begin
  for reservation_row in
    select r.id, r.order_id from public.reservations r
    where r.status = 'active' and r.expires_at <= now() for update
  loop
    for item_row in select product_id, quantity from public.order_items where order_id = reservation_row.order_id and product_id is not null loop
      update public.products set reserved_quantity = greatest(0, reserved_quantity - item_row.quantity), updated_at = now() where id = item_row.product_id;
    end loop;
    update public.reservations set status = 'expired', updated_at = now() where id = reservation_row.id;
    update public.orders set status = 'cancelled', updated_at = now() where id = reservation_row.order_id and payment_status = 'pending';
    released := released + 1;
  end loop;
  return released;
end;
$$;

create or replace function public.enforce_two_open_reservations()
returns trigger language plpgsql security definer set search_path = public as $$
declare customer uuid; open_reservations integer := 0;
begin
  select customer_id into customer from public.orders where id = new.order_id;
  if customer is null then raise exception 'ORDER_CUSTOMER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(customer::text, 0));
  perform public.release_expired_reservations();
  select count(*)::integer into open_reservations
  from public.reservations r join public.orders o on o.id = r.order_id
  where o.customer_id = customer and o.payment_status = 'pending' and o.status = 'pending_payment'
    and r.status = 'active' and r.expires_at > now();
  if open_reservations >= 2 then raise exception 'MAX_OPEN_RESERVATIONS_REACHED'; end if;
  return new;
end;
$$;

create or replace function public.create_pending_order(cart_items jsonb, delivery_name text, delivery_phone text, delivery_address text, requested_promo_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
 customer uuid := auth.uid(); order_id uuid; reservation_id uuid; item jsonb; product_row record; promo_row record; delivery_row record;
 requested_quantity integer; available_quantity integer; v_subtotal numeric(12,2) := 0; v_delivery_fee numeric(12,2) := 0; v_discount numeric(12,2) := 0; v_total numeric(12,2) := 0; item_total numeric(12,2); v_expires_at timestamptz;
 v_delivery_enabled boolean := false; v_free_delivery_enabled boolean := false; v_promo_code text; v_promo_discount_type text; v_promo_discount_value numeric(12,2); v_promo_minimum_order numeric(12,2); v_promo_maximum_discount numeric(12,2);
 normalized_promo text := nullif(lower(trim(coalesce(requested_promo_code, ''))), '');
begin
 if customer is null then raise exception 'AUTH_REQUIRED'; end if;
 if nullif(trim(delivery_name),'') is null or nullif(trim(delivery_phone),'') is null or nullif(trim(delivery_address),'') is null then raise exception 'DELIVERY_DETAILS_REQUIRED'; end if;
 if jsonb_typeof(cart_items) <> 'array' or jsonb_array_length(cart_items)=0 then raise exception 'CART_EMPTY'; end if;
 perform public.release_expired_reservations();
 select delivery_fee, free_delivery_threshold, is_delivery_enabled, is_free_delivery_enabled into delivery_row from public.delivery_settings where is_active = true order by updated_at desc limit 1;
 if found then
   v_delivery_enabled := coalesce(delivery_row.is_delivery_enabled,false); v_free_delivery_enabled := coalesce(delivery_row.is_free_delivery_enabled,false);
   if v_delivery_enabled and delivery_row.delivery_fee is null then raise exception 'DELIVERY_CONFIGURATION_INVALID'; end if;
   if v_free_delivery_enabled and delivery_row.free_delivery_threshold is null then raise exception 'DELIVERY_CONFIGURATION_INVALID'; end if;
 end if;
 insert into public.orders(customer_id,status,payment_status,delivery_name,delivery_phone,delivery_address)
 values(customer,'pending_payment','pending',trim(delivery_name),trim(delivery_phone),trim(delivery_address)) returning id into order_id;
 for item in select * from jsonb_array_elements(cart_items) loop
   requested_quantity := (item ->> 'quantity')::integer;
   if requested_quantity is null or requested_quantity <= 0 then raise exception 'INVALID_QUANTITY'; end if;
   select id,name,price,stock_quantity,reserved_quantity,is_active into product_row from public.products where id=(item->>'productId')::uuid for update;
   if not found or not product_row.is_active then raise exception 'PRODUCT_UNAVAILABLE:%', item->>'productId'; end if;
   available_quantity := greatest(0,product_row.stock_quantity-product_row.reserved_quantity);
   if available_quantity < requested_quantity then raise exception 'INSUFFICIENT_STOCK:%',product_row.name; end if;
   item_total := round(product_row.price*requested_quantity,2); v_subtotal := v_subtotal+item_total;
   insert into public.order_items(order_id,product_id,product_name,unit_price,quantity,line_total) values(order_id,product_row.id,product_row.name,product_row.price,requested_quantity,item_total);
   update public.products set reserved_quantity=reserved_quantity+requested_quantity,updated_at=now() where id=product_row.id;
 end loop;
 if v_delivery_enabled then v_delivery_fee := delivery_row.delivery_fee; if v_free_delivery_enabled and v_subtotal >= delivery_row.free_delivery_threshold then v_delivery_fee := 0; end if; end if;
 if normalized_promo is not null then
   select * into promo_row from public.promo_codes where lower(code)=normalized_promo and is_active=true and (starts_at is null or starts_at<=now()) and (expires_at is null or expires_at>=now()) and (usage_limit is null or usage_count<usage_limit) for update;
   if not found then raise exception 'PROMO_INVALID'; end if;
   if v_subtotal < promo_row.minimum_order_amount then raise exception 'PROMO_MINIMUM_NOT_MET:%',promo_row.minimum_order_amount; end if;
   v_promo_code:=promo_row.code; v_promo_discount_type:=promo_row.discount_type; v_promo_discount_value:=promo_row.discount_value; v_promo_minimum_order:=promo_row.minimum_order_amount; v_promo_maximum_discount:=promo_row.maximum_discount_amount;
   if promo_row.discount_type='percentage' then v_discount:=round(v_subtotal*promo_row.discount_value/100,2); if promo_row.maximum_discount_amount is not null then v_discount:=least(v_discount,promo_row.maximum_discount_amount); end if; else v_discount:=least(promo_row.discount_value,v_subtotal); end if;
   update public.promo_codes set usage_count=usage_count+1,updated_at=now() where id=promo_row.id;
 end if;
 v_total := greatest(0,round(v_subtotal+v_delivery_fee-v_discount,2));
 update public.orders set subtotal=v_subtotal,fees=v_delivery_fee,delivery_fee=v_delivery_fee,discount_amount=v_discount,promo_code=v_promo_code,promo_discount_type=v_promo_discount_type,promo_discount_value=v_promo_discount_value,promo_minimum_order=v_promo_minimum_order,promo_maximum_discount=v_promo_maximum_discount,total=v_total,updated_at=now() where id=order_id;
 v_expires_at := now()+interval '15 minutes';
 insert into public.reservations(order_id,status,expires_at) values(order_id,'active',v_expires_at) returning id into reservation_id;
 insert into public.payments(order_id,provider,status,amount) values(order_id,'paystack','pending',v_total);
 return jsonb_build_object('order_id',order_id,'reservation_id',reservation_id,'subtotal',v_subtotal,'delivery_fee',v_delivery_fee,'delivery_enabled',v_delivery_enabled,'free_delivery_enabled',v_free_delivery_enabled,'discount',v_discount,'total',v_total,'promo_code',v_promo_code,'expires_at',v_expires_at);
exception when others then if order_id is not null then delete from public.orders where id=order_id; end if; raise;
end;
$$;

create or replace function public.cancel_pending_order(target_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare customer uuid:=auth.uid(); order_row record; reservation_row record; item_row record; final_reservation_status text; was_released boolean:=false;
begin
 if customer is null then raise exception 'AUTH_REQUIRED'; end if;
 select id,customer_id,status,payment_status,promo_code into order_row from public.orders where id=target_order_id for update;
 if not found or order_row.customer_id<>customer then raise exception 'ORDER_NOT_FOUND'; end if;
 if order_row.payment_status<>'pending' or order_row.status<>'pending_payment' then if order_row.status='cancelled' and order_row.payment_status='pending' then return jsonb_build_object('order_id',order_row.id,'status','cancelled','already_cancelled',true); end if; raise exception 'ORDER_NOT_CANCELLABLE'; end if;
 select id,status,expires_at into reservation_row from public.reservations where order_id=order_row.id order by created_at desc limit 1 for update;
 if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
 if reservation_row.status='active' then
   final_reservation_status:=case when reservation_row.expires_at<=now() then 'expired' else 'cancelled' end;
   for item_row in select product_id,quantity from public.order_items where order_id=order_row.id and product_id is not null loop update public.products set reserved_quantity=greatest(0,reserved_quantity-item_row.quantity),updated_at=now() where id=item_row.product_id; end loop;
   was_released:=true; update public.reservations set status=final_reservation_status,updated_at=now() where id=reservation_row.id;
   if order_row.promo_code is not null then update public.promo_codes set usage_count=greatest(0,usage_count-1),updated_at=now() where code=order_row.promo_code and usage_count>0; end if;
   update public.orders set status='cancelled',updated_at=now() where id=order_row.id;
   return jsonb_build_object('order_id',order_row.id,'status','cancelled','reservation_status',final_reservation_status,'stock_released',was_released);
 end if;
 if reservation_row.status in ('expired','cancelled') then update public.orders set status='cancelled',updated_at=now() where id=order_row.id; return jsonb_build_object('order_id',order_row.id,'status','cancelled','reservation_status',reservation_row.status,'stock_released',false); end if;
 raise exception 'ORDER_NOT_CANCELLABLE';
end;
$$;

create or replace function public.retry_expired_pending_order(target_order_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare customer uuid:=auth.uid(); order_row record; reservation_row record; item_row record; released boolean:=false;
begin
 if customer is null then raise exception 'AUTH_REQUIRED'; end if;
 select id,customer_id,status,payment_status,promo_code into order_row from public.orders where id=target_order_id for update;
 if not found or order_row.customer_id<>customer then raise exception 'ORDER_NOT_FOUND'; end if;
 if order_row.payment_status<>'pending' then raise exception 'ORDER_NOT_RETRYABLE'; end if;
 if order_row.status not in ('pending_payment','cancelled') then raise exception 'ORDER_NOT_RETRYABLE'; end if;
 select id,status,expires_at into reservation_row from public.reservations where order_id=target_order_id order by created_at desc limit 1 for update;
 if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
 if reservation_row.status='active' and reservation_row.expires_at>now() then raise exception 'RESERVATION_STILL_ACTIVE'; end if;
 if reservation_row.status='active' then
   for item_row in select product_id,quantity from public.order_items where order_id=target_order_id and product_id is not null loop update public.products set reserved_quantity=greatest(0,reserved_quantity-item_row.quantity),updated_at=now() where id=item_row.product_id; end loop;
   update public.reservations set status='expired',updated_at=now() where id=reservation_row.id and status='active'; released:=true;
   if order_row.promo_code is not null then update public.promo_codes set usage_count=greatest(0,usage_count-1),updated_at=now() where code=order_row.promo_code and usage_count>0; end if;
 elsif reservation_row.status not in ('expired','cancelled') then raise exception 'ORDER_NOT_RETRYABLE'; end if;
 update public.orders set status='cancelled',updated_at=now() where id=target_order_id and payment_status='pending';
 return jsonb_build_object('order_id',target_order_id,'status','cancelled','reservation_released',released);
end;
$$;

create or replace function public.get_customer_cart()
returns jsonb language plpgsql security definer set search_path = public as $$
declare customer uuid:=auth.uid(); v_cart_id uuid; result jsonb:='[]'::jsonb;
begin
 if customer is null then raise exception 'AUTH_REQUIRED'; end if;
 select id into v_cart_id from public.customer_carts where customer_id=customer;
 if v_cart_id is null then return result; end if;
 update public.customer_cart_items i set quantity=least(i.quantity,p.stock_quantity),updated_at=now() from public.products p where i.cart_id=v_cart_id and p.id=i.product_id;
 delete from public.customer_cart_items i where i.cart_id=v_cart_id and not exists(select 1 from public.products p where p.id=i.product_id and p.is_active=true and p.stock_quantity>0);
 select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'quantity',i.quantity) order by i.created_at),'[]'::jsonb) into result from public.customer_cart_items i where i.cart_id=v_cart_id;
 return result;
end;
$$;

create or replace function public.set_customer_cart(cart_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare customer uuid:=auth.uid(); v_cart_id uuid; item jsonb; product_row record; requested_quantity integer; result jsonb:='[]'::jsonb;
begin
 if customer is null then raise exception 'AUTH_REQUIRED'; end if; if jsonb_typeof(cart_items)<>'array' then raise exception 'CART_INVALID'; end if;
 insert into public.customer_carts(customer_id) values(customer) on conflict(customer_id) do update set updated_at=now() returning id into v_cart_id;
 delete from public.customer_cart_items where cart_id=v_cart_id;
 for item in select * from jsonb_array_elements(cart_items) loop
   requested_quantity:=greatest(1,coalesce((item->>'quantity')::integer,1));
   select p.id,p.stock_quantity,p.is_active into product_row from public.products p where p.id=(item->>'productId')::uuid;
   if not found or not product_row.is_active or product_row.stock_quantity<=0 then continue; end if;
   insert into public.customer_cart_items(cart_id,product_id,quantity,updated_at) values(v_cart_id,product_row.id,least(requested_quantity,product_row.stock_quantity),now());
 end loop;
 update public.customer_carts set updated_at=now() where id=v_cart_id;
 select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'quantity',i.quantity) order by i.created_at),'[]'::jsonb) into result from public.customer_cart_items i where i.cart_id=v_cart_id;
 return result;
end;
$$;

create or replace function public.merge_customer_cart(cart_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare customer uuid:=auth.uid(); v_cart_id uuid; item jsonb; product_row record; requested_quantity integer; existing_quantity integer; final_quantity integer; result jsonb:='[]'::jsonb;
begin
 if customer is null then raise exception 'AUTH_REQUIRED'; end if; if jsonb_typeof(cart_items)<>'array' then raise exception 'CART_INVALID'; end if;
 insert into public.customer_carts(customer_id) values(customer) on conflict(customer_id) do update set updated_at=now() returning id into v_cart_id;
 for item in select * from jsonb_array_elements(cart_items) loop
   if nullif(trim(item->>'productId'),'') is null then continue; end if;
   requested_quantity:=greatest(1,coalesce((item->>'quantity')::integer,1));
   select p.id,p.stock_quantity,p.is_active into product_row from public.products p where p.id=(item->>'productId')::uuid;
   if not found or not product_row.is_active or product_row.stock_quantity<=0 then continue; end if;
   select i.quantity into existing_quantity from public.customer_cart_items i where i.cart_id=v_cart_id and i.product_id=product_row.id for update;
   final_quantity:=least(product_row.stock_quantity,greatest(requested_quantity,coalesce(existing_quantity,0)));
   insert into public.customer_cart_items(cart_id,product_id,quantity,updated_at) values(v_cart_id,product_row.id,final_quantity,now()) on conflict(cart_id,product_id) do update set quantity=excluded.quantity,updated_at=now();
 end loop;
 update public.customer_carts set updated_at=now() where id=v_cart_id;
 select coalesce(jsonb_agg(jsonb_build_object('productId',i.product_id,'quantity',i.quantity) order by i.created_at),'[]'::jsonb) into result from public.customer_cart_items i where i.cart_id=v_cart_id;
 return result;
end;
$$;

create or replace function public.admin_update_order_status(target_order_id uuid,target_status text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare updated_order public.orders;
begin
 if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 if target_status not in ('pending_payment','paid','processing','completed','cancelled') then raise exception 'INVALID_ORDER_STATUS'; end if;
 update public.orders set status=target_status,updated_at=now() where id=target_order_id returning * into updated_order;
 if updated_order.id is null then raise exception 'ORDER_NOT_FOUND'; end if; return updated_order;
end;
$$;

create or replace function public.provision_admin(target_user_id uuid,target_display_name text default null)
returns void language plpgsql security definer set search_path = public as $$
begin insert into public.admin_users(user_id,display_name) values(target_user_id,target_display_name) on conflict(user_id) do update set display_name=excluded.display_name; delete from public.customer_profiles where id=target_user_id; end;
$$;

create or replace function public.finalize_paystack_payment(target_reference text,target_status text,target_amount_kobo bigint,target_raw_response jsonb,target_paid_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare payment_row record; order_row record; reservation_row record; item_row record; expected_amount_kobo bigint; final_status text:=lower(target_status);
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'TRUSTED_PAYMENT_PATH_ONLY'; end if;
 if final_status not in ('success','failed') then raise exception 'INVALID_PAYMENT_STATUS'; end if;
 select p.id,p.order_id,p.status,p.amount into payment_row from public.payments p where p.provider='paystack' and p.provider_reference=target_reference for update;
 if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
 expected_amount_kobo:=round(payment_row.amount*100)::bigint; if target_amount_kobo is not null and target_amount_kobo<>expected_amount_kobo then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
 select * into order_row from public.orders where id=payment_row.order_id for update;
 select * into reservation_row from public.reservations where order_id=order_row.id for update;
 if final_status='success' then
   if payment_row.status='successful' then return jsonb_build_object('order_id',order_row.id,'payment_status','successful','already_processed',true); end if;
   update public.payments set status='successful',raw_response=target_raw_response,updated_at=now() where id=payment_row.id;
   update public.orders set payment_status='successful',status='paid',updated_at=now() where id=order_row.id;
   if reservation_row.id is not null and reservation_row.status='active' then
     for item_row in select product_id,quantity from public.order_items where order_id=order_row.id and product_id is not null loop update public.products set stock_quantity=greatest(0,stock_quantity-item_row.quantity),reserved_quantity=greatest(0,reserved_quantity-item_row.quantity),updated_at=now() where id=item_row.product_id; end loop;
     update public.reservations set status='confirmed',updated_at=now() where id=reservation_row.id;
   end if;
 else
   if payment_row.status='failed' then return jsonb_build_object('order_id',order_row.id,'payment_status','failed','already_processed',true); end if;
   update public.payments set status='failed',raw_response=target_raw_response,updated_at=now() where id=payment_row.id;
   if reservation_row.id is not null and reservation_row.status='active' then
     for item_row in select product_id,quantity from public.order_items where order_id=order_row.id and product_id is not null loop update public.products set reserved_quantity=greatest(0,reserved_quantity-item_row.quantity),updated_at=now() where id=item_row.product_id; end loop;
     update public.reservations set status='expired',updated_at=now() where id=reservation_row.id;
   end if;
   update public.orders set payment_status='failed',status='cancelled',updated_at=now() where id=order_row.id;
 end if;
 return jsonb_build_object('order_id',order_row.id,'payment_status',case when final_status='success' then 'successful' else 'failed' end,'already_processed',false);
end;
$$;

create or replace function public.rls_auto_enable()
returns event_trigger language plpgsql security definer set search_path = pg_catalog as $$
declare cmd record;
begin
 for cmd in select * from pg_event_trigger_ddl_commands() where command_tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO') and object_type in ('table','partitioned table') loop
   if cmd.schema_name='public' then begin execute format('alter table if exists %s enable row level security',cmd.object_identity); exception when others then null; end; end if;
 end loop;
end;
$$;

alter table public.customer_profiles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.reservations enable row level security;
alter table public.payments enable row level security;
alter table public.admin_users enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.promo_codes enable row level security;
alter table public.customer_carts enable row level security;
alter table public.customer_cart_items enable row level security;

create policy "Customers can view own profile" on public.customer_profiles for select to public using (auth.uid()=id);
create policy "Customers can update own profile" on public.customer_profiles for update to public using (auth.uid()=id) with check (auth.uid()=id);
create policy "Anyone can view active categories" on public.categories for select to public using (is_active=true);
create policy "Admins can insert categories" on public.categories for insert to authenticated with check (is_admin());
create policy "Admins can update categories" on public.categories for update to authenticated using (is_admin()) with check (is_admin());
create policy "Admins can delete categories" on public.categories for delete to authenticated using (is_admin());
create policy "Anyone can view active products" on public.products for select to public using (is_active=true);
create policy "Admins can insert products" on public.products for insert to authenticated with check (is_admin());
create policy "Admins can update products" on public.products for update to authenticated using (is_admin()) with check (is_admin());
create policy "Admins can delete products" on public.products for delete to authenticated using (is_admin());
create policy "Customers can view own orders" on public.orders for select to public using (auth.uid()=customer_id);
create policy "Admins can view all orders" on public.orders for select to authenticated using (is_admin());
create policy "Customers can view own order items" on public.order_items for select to public using (exists(select 1 from public.orders o where o.id=order_items.order_id and o.customer_id=auth.uid()));
create policy "Admins can view all order items" on public.order_items for select to authenticated using (is_admin());
create policy "Customers can view own reservations" on public.reservations for select to public using (exists(select 1 from public.orders o where o.id=reservations.order_id and o.customer_id=auth.uid()));
create policy "Admins can view all reservations" on public.reservations for select to authenticated using (is_admin());
create policy "Customers can view own payments" on public.payments for select to public using (exists(select 1 from public.orders o where o.id=payments.order_id and o.customer_id=auth.uid()));
create policy "Admins can view all payments" on public.payments for select to authenticated using (is_admin());
create policy "Admins can view own admin record" on public.admin_users for select to authenticated using (user_id=auth.uid());
create policy "Anyone can view active delivery settings" on public.delivery_settings for select to public using (is_active=true);
create policy "Admins can manage delivery settings" on public.delivery_settings for all to authenticated using (is_admin()) with check (is_admin());
create policy "Admins can manage promo codes" on public.promo_codes for all to authenticated using (is_admin()) with check (is_admin());
create policy "Customers can view own cart" on public.customer_carts for select to public using (auth.uid()=customer_id);
create policy "Customers can view own cart items" on public.customer_cart_items for select to public using (exists(select 1 from public.customer_carts c where c.id=customer_cart_items.cart_id and c.customer_id=auth.uid()));

create trigger customer_profiles_set_updated_at before update on public.customer_profiles for each row execute function public.set_customer_profile_updated_at();
create trigger prevent_payment_status_tampering before update on public.orders for each row execute function public.prevent_payment_status_tampering();
create trigger enforce_two_open_reservations before insert on public.reservations for each row execute function public.enforce_two_open_reservations();

create or replace function public.prevent_payment_status_tampering() returns trigger language plpgsql set search_path = public as $$
begin
  if new.payment_status is distinct from old.payment_status and coalesce(auth.role(), '') <> 'service_role' then raise exception 'PAYMENT_STATUS_TRUSTED_PATH_ONLY'; end if;
  return new;
end;
$$;

revoke execute on function public.is_admin(uuid) from anon;
revoke execute on function public.finalize_paystack_payment(text,text,bigint,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_paystack_payment(text,text,bigint,jsonb,timestamptz) to service_role;
grant execute on function public.create_pending_order(jsonb,text,text,text,text) to authenticated;
grant execute on function public.cancel_pending_order(uuid) to authenticated;
grant execute on function public.retry_expired_pending_order(uuid) to authenticated;
grant execute on function public.get_customer_cart() to authenticated;
grant execute on function public.set_customer_cart(jsonb) to authenticated;
grant execute on function public.merge_customer_cart(jsonb) to authenticated;
grant execute on function public.admin_update_order_status(uuid,text) to authenticated;
grant execute on function public.provision_admin(uuid,text) to service_role;
grant execute on function public.release_expired_reservations() to service_role;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_customer();
