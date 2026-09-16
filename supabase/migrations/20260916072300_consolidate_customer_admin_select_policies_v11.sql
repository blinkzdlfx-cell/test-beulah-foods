begin;

drop policy if exists "Admins can view all order items" on public.order_items;
drop policy if exists "Customers can view own order items" on public.order_items;
create policy "Customers and admins can view order items"
  on public.order_items
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.customer_id = (select auth.uid())
    )
  );

drop policy if exists "Admins can view all orders" on public.orders;
drop policy if exists "Customers can view own orders" on public.orders;
create policy "Customers and admins can view orders"
  on public.orders
  for select
  to authenticated
  using (
    public.is_admin()
    or (select auth.uid()) = customer_id
  );

drop policy if exists "Admins can view all payments" on public.payments;
drop policy if exists "Customers can view own payments" on public.payments;
create policy "Customers and admins can view payments"
  on public.payments
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.orders o
      where o.id = payments.order_id
        and o.customer_id = (select auth.uid())
    )
  );

drop policy if exists "Admins can view all reservations" on public.reservations;
drop policy if exists "Customers can view own reservations" on public.reservations;
create policy "Customers and admins can view reservations"
  on public.reservations
  for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1
      from public.orders o
      where o.id = reservations.order_id
        and o.customer_id = (select auth.uid())
    )
  );

create index if not exists customer_cart_items_product_id_idx
  on public.customer_cart_items (product_id);

commit;
