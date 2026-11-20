-- Automatic confirmation of manual mobile money payments.
-- The owner's phone forwards the MTN/Airtel "money received" SMS to the cvc-sms Edge Function. The SMS is the proof:
-- when its transaction ID and amount match what a customer submitted, the payment is confirmed without anyone clicking.
-- Works whichever arrives first (the SMS or the customer's submission). Auto-approval is OFF until an admin switches it on.
create table public.cvc_sms_inbox (
  id bigint generated always as identity primary key,
  received_at timestamptz not null default now(),
  sender text not null default '',
  body text not null,
  ids text[] not null default '{}',
  amounts int[] not null default '{}',
  consumed_by uuid references public.cvc_payments (id) on delete set null
);
create index cvc_sms_inbox_at_idx on public.cvc_sms_inbox (received_at desc);
alter table public.cvc_sms_inbox enable row level security;
revoke all on public.cvc_sms_inbox from anon, authenticated;

insert into public.cvc_settings (key, value) values ('auto_approve_manual', 'false'::jsonb) on conflict (key) do nothing;

create function public.cvc_sms_ids(p_body text) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct t), '{}') from (
    select upper(replace(m[1], '.', '')) t from regexp_matches(coalesce(p_body, ''), '([A-Za-z0-9][A-Za-z0-9.]{6,}[A-Za-z0-9])', 'g') m) x where length(t) >= 8
$$;

create function public.cvc_sms_amounts(p_body text) returns int[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(distinct v), '{}') from (
    select replace(m[1], ',', '')::int v from regexp_matches(coalesce(p_body, ''), '(?<![0-9])([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,9})(?![0-9])', 'g') m) x
$$;

-- Confirms a waiting manual payment if an unused SMS proves it. Returns true when it did.
create function public.cvc_try_auto_approve(p_payment uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare p public.cvc_payments; s public.cvc_sms_inbox;
begin
  if coalesce((select value from public.cvc_settings where key = 'auto_approve_manual'), 'false'::jsonb) <> 'true'::jsonb then return false; end if;
  -- Safety valve: never auto-approve more than 50 payments in a day, so a flood of fake messages cannot hand out plans unchecked.
  if (select count(*) from public.cvc_audit where action = 'payment.auto_approve' and at > now() - interval '1 day') >= 50 then return false; end if;
  select * into p from public.cvc_payments where id = p_payment and provider = 'manual' and status = 'pending' for update;
  if not found then return false; end if;
  select * into s from public.cvc_sms_inbox where consumed_by is null and p.provider_ref = any(ids) and p.amount = any(amounts)
    and received_at > p.created_at - interval '7 days' order by received_at limit 1 for update skip locked;
  if not found then return false; end if;
  update public.cvc_sms_inbox set consumed_by = p.id where id = s.id;
  update public.cvc_payments set status = 'succeeded', paid_at = now() where id = p.id;
  perform public.cvc_grant_access(p.user_id, p.plan, p.months * 30);
  insert into public.cvc_audit (admin_id, action, detail) values (null, 'payment.auto_approve', jsonb_build_object('payment', p.id, 'ref', p.provider_ref, 'amount', p.amount, 'user', p.user_id, 'sms', s.id));
  return true;
end $$;

-- Called by the cvc-sms Edge Function (service role) for each forwarded SMS.
create function public.cvc_process_sms(p_sender text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s public.cvc_sms_inbox; pid uuid; hit int := 0;
begin
  delete from public.cvc_sms_inbox where received_at < now() - interval '30 days';
  insert into public.cvc_sms_inbox (sender, body, ids, amounts) values (left(coalesce(p_sender, ''), 40), left(coalesce(p_body, ''), 1000), public.cvc_sms_ids(p_body), public.cvc_sms_amounts(p_body)) returning * into s;
  for pid in select id from public.cvc_payments where provider = 'manual' and status = 'pending' and provider_ref = any(s.ids) and amount = any(s.amounts) loop
    if public.cvc_try_auto_approve(pid) then hit := hit + 1; end if;
  end loop;
  return jsonb_build_object('stored', true, 'confirmed', hit);
end $$;

-- Customer submission: now also confirms instantly if the SMS already arrived.
create or replace function public.cvc_submit_manual_payment(p_plan text, p_months int, p_network text, p_phone text, p_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.cvc_accounts; amt int; ref text := upper(regexp_replace(coalesce(p_ref, ''), '[^A-Za-z0-9]', '', 'g')); ph text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'); pid uuid; ok boolean;
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
  ok := public.cvc_try_auto_approve(pid);
  return jsonb_build_object('id', pid, 'amount', amt, 'approved', ok);
end $$;

create or replace function public.cvc_admin_payments(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cvc_assert_admin();
  return coalesce((select jsonb_agg(r) from (
    select jsonb_build_object('id', p.id, 'txRef', p.tx_ref, 'email', u.email, 'plan', p.plan, 'months', p.months, 'amount', p.amount, 'currency', p.currency,
      'status', p.status, 'method', p.method, 'provider', p.provider, 'providerRef', p.provider_ref, 'payerPhone', p.payer_phone, 'createdAt', p.created_at, 'paidAt', p.paid_at,
      'smsSeen', (p.provider = 'manual' and p.status = 'pending' and exists (select 1 from public.cvc_sms_inbox s where s.consumed_by is null and p.provider_ref = any(s.ids) and p.amount = any(s.amounts)))) r
    from public.cvc_payments p left join auth.users u on u.id = p.user_id
    order by (p.provider = 'manual' and p.status = 'pending') desc, p.created_at desc limit least(greatest(p_limit, 1), 500)) s), '[]');
end $$;

create function public.cvc_admin_auto_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cvc_assert_admin();
  return jsonb_build_object(
    'enabled', coalesce((select value from public.cvc_settings where key = 'auto_approve_manual'), 'false'::jsonb) = 'true'::jsonb,
    'lastSmsAt', (select max(received_at) from public.cvc_sms_inbox),
    'sms24h', (select count(*) from public.cvc_sms_inbox where received_at > now() - interval '1 day'),
    'auto24h', (select count(*) from public.cvc_audit where action = 'payment.auto_approve' and at > now() - interval '1 day'));
end $$;

create function public.cvc_admin_set_auto(p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cvc_assert_admin();
  update public.cvc_settings set value = to_jsonb(p_enabled) where key = 'auto_approve_manual';
  insert into public.cvc_audit (admin_id, action, detail) values (auth.uid(), 'auto_approve.' || case when p_enabled then 'on' else 'off' end, '{}'::jsonb);
end $$;

revoke execute on function public.cvc_sms_ids(text), public.cvc_sms_amounts(text), public.cvc_try_auto_approve(uuid), public.cvc_process_sms(text, text) from public, anon, authenticated;
grant execute on function public.cvc_process_sms(text, text) to service_role;
revoke execute on function public.cvc_admin_auto_status(), public.cvc_admin_set_auto(boolean) from public, anon;
grant execute on function public.cvc_admin_auto_status(), public.cvc_admin_set_auto(boolean) to authenticated;
