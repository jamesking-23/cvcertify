-- Manual mobile money: the customer sends money to the owner's MTN/Airtel number and submits the transaction ID.
-- An admin checks it against the MoMo statement and approves; approval grants the plan.
alter table public.cvc_payments add column payer_phone text;
create unique index cvc_payments_manual_ref on public.cvc_payments (provider_ref) where provider = 'manual';
grant select (provider, provider_ref) on public.cvc_payments to authenticated;

create function public.cvc_submit_manual_payment(p_plan text, p_months int, p_network text, p_phone text, p_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.cvc_accounts; amt int; ref text := upper(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g')); ph text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'); pid uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in to continue.' using hint = 'unauthenticated'; end if;
  if p_plan not in ('professional','career') then raise exception 'Choose a paid plan.'; end if;
  if p_months not in (1, 3, 12) then raise exception 'Choose 1, 3 or 12 months.'; end if;
  if p_network not in ('mtn','airtel') then raise exception 'Choose MTN or Airtel.'; end if;
  if length(ph) not between 9 and 15 then raise exception 'Enter the phone number you paid from.'; end if;
  if length(ref) not between 6 and 30 then raise exception 'Enter the transaction ID from your payment confirmation message.'; end if;
  select * into a from public.cvc_accounts where user_id = auth.uid();
  if not found then raise exception 'Finish setting up your account first.' using hint = 'no_account'; end if;
  if public.cvc_plan_rank(public.cvc_effective_plan(a.plan, a.plan_expires_at)) > public.cvc_plan_rank(p_plan) then
    raise exception 'You already have a higher plan active.' using hint = 'higher_plan';
  end if;
  if (select count(*) from public.cvc_payments where user_id = auth.uid() and provider = 'manual' and status = 'pending') >= 3 then
    raise exception 'You already have payments waiting to be checked. Please wait for them to be confirmed.' using hint = 'too_many_pending';
  end if;
  amt := public.cvc_plan_price(p_plan) * p_months;
  begin
    insert into public.cvc_payments (user_id, tx_ref, provider, plan, months, amount, currency, method, provider_ref, payer_phone)
    values (auth.uid(), 'cvm_' || replace(gen_random_uuid()::text, '-', ''), 'manual', p_plan, p_months, amt, 'UGX', p_network, ref, left(ph, 15)) returning id into pid;
  exception when unique_violation then
    raise exception 'That transaction ID has already been submitted.' using hint = 'duplicate_ref';
  end;
  return jsonb_build_object('id', pid, 'amount', amt);
end $$;

create function public.cvc_admin_review_payment(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare p public.cvc_payments;
begin
  perform public.cvc_assert_admin();
  select * into p from public.cvc_payments where id = p_id and provider = 'manual' and status = 'pending' for update;
  if not found then raise exception 'That payment is not waiting for review.'; end if;
  if p_approve then
    update public.cvc_payments set status = 'succeeded', paid_at = now() where id = p.id;
    perform public.cvc_grant_access(p.user_id, p.plan, p.months * 30);
  else
    update public.cvc_payments set status = 'failed' where id = p.id;
  end if;
  insert into public.cvc_audit (admin_id, action, detail) values (auth.uid(), case when p_approve then 'payment.approve' else 'payment.reject' end, jsonb_build_object('payment', p.id, 'ref', p.provider_ref, 'amount', p.amount, 'user', p.user_id));
end $$;

create or replace function public.cvc_admin_payments(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cvc_assert_admin();
  return coalesce((select jsonb_agg(r) from (
    select jsonb_build_object('id', p.id, 'txRef', p.tx_ref, 'email', u.email, 'plan', p.plan, 'months', p.months, 'amount', p.amount, 'currency', p.currency,
      'status', p.status, 'method', p.method, 'provider', p.provider, 'providerRef', p.provider_ref, 'payerPhone', p.payer_phone, 'createdAt', p.created_at, 'paidAt', p.paid_at) r
    from public.cvc_payments p left join auth.users u on u.id = p.user_id
    order by (p.provider = 'manual' and p.status = 'pending') desc, p.created_at desc limit least(greatest(p_limit, 1), 500)) s), '[]');
end $$;

revoke execute on function public.cvc_submit_manual_payment(text, int, text, text, text), public.cvc_admin_review_payment(uuid, boolean) from public, anon;
grant execute on function public.cvc_submit_manual_payment(text, int, text, text, text), public.cvc_admin_review_payment(uuid, boolean) to authenticated;
