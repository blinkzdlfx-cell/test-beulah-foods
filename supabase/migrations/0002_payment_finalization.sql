-- Beulah Foods staging reconstruction: trusted Paystack finalization.
-- Foundational schema was verified in the empty staging project before this
-- function was added. This function is service-role only.

create or replace function public.finalize_paystack_payment(target_reference text,target_status text,target_amount_kobo bigint,target_raw_response jsonb,target_paid_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p record; o record; r record; i record; expected_kobo bigint; s text:=lower(target_status);
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'TRUSTED_PAYMENT_PATH_ONLY'; end if;
  if s not in('success','failed') then raise exception 'INVALID_PAYMENT_STATUS'; end if;
  select * into p from public.payments where provider='paystack' and provider_reference=target_reference for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  expected_kobo:=round(p.amount*100)::bigint;
  if target_amount_kobo is not null and target_amount_kobo<>expected_kobo then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;
  select * into o from public.orders where id=p.order_id for update;
  select * into r from public.reservations where order_id=o.id for update;
  if p.status='successful' then return jsonb_build_object('order_id',o.id,'payment_status','successful','already_finalized',true); end if;
  if p.status='failed' and s='failed' then return jsonb_build_object('order_id',o.id,'payment_status','failed','already_finalized',true); end if;
  if s='success' then
    for i in select product_id,quantity from public.order_items where order_id=o.id and product_id is not null loop
      update public.products set stock_quantity=stock_quantity-i.quantity,reserved_quantity=greatest(0,reserved_quantity-i.quantity),updated_at=now() where id=i.product_id;
    end loop;
    update public.payments set status='successful',raw_response=target_raw_response,updated_at=now() where id=p.id;
    update public.orders set payment_status='successful',status='paid',updated_at=now() where id=o.id;
    if r.id is not null then update public.reservations set status='confirmed',updated_at=now() where id=r.id; end if;
    return jsonb_build_object('order_id',o.id,'payment_status','successful','status','paid','transitioned',true);
  end if;
  update public.payments set status='failed',raw_response=target_raw_response,updated_at=now() where id=p.id;
  if r.id is not null and r.status='active' then
    for i in select product_id,quantity from public.order_items where order_id=o.id and product_id is not null loop
      update public.products set reserved_quantity=greatest(0,reserved_quantity-i.quantity),updated_at=now() where id=i.product_id;
    end loop;
    update public.reservations set status=case when r.expires_at<=now() then 'expired' else 'cancelled' end,updated_at=now() where id=r.id;
  end if;
  update public.orders set payment_status='failed',status='cancelled',updated_at=now() where id=o.id;
  return jsonb_build_object('order_id',o.id,'payment_status','failed','status','cancelled','transitioned',true);
end;
$$;

revoke all on function public.finalize_paystack_payment(text,text,bigint,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.finalize_paystack_payment(text,text,bigint,jsonb,timestamptz) to service_role;
