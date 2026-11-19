-- Billing, redeem codes, analytics and the admin console. Everything is prefixed cvc_ (the project is shared with another app).
-- Paid access is time-limited: cvc_accounts.plan_expires_at. When it passes, the account behaves as Starter without any cron job.

------------------------------------------------------------------ plan expiry
alter table public.cvc_accounts add column plan_expires_at timestamptz;

create function public.cvc_effective_plan(p text, exp timestamptz) returns text
language sql stable set search_path = '' as $$
  select case when p = 'starter' or p is null then 'starter' when exp is null or exp > now() then p else 'starter' end
$$;

create function public.cvc_plan_rank(p text) returns int
language sql immutable set search_path = '' as $$ select case p when 'career' then 2 when 'professional' then 1 else 0 end $$;

-- Prices in UGX per month. Single source of truth for charging; the client only displays them.
create function public.cvc_plan_price(p text) returns int
language sql immutable set search_path = '' as $$ select case p when 'professional' then 2500 when 'career' then 5000 else 0 end $$;

create or replace function public.cvc_my_plan(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.cvc_effective_plan(plan, plan_expires_at) from public.cvc_accounts where user_id = p_user), 'starter')
$$;

create or replace function public.cvc_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.cvc_accounts; m text := to_char(now(), 'YYYY-MM'); ep text;
begin
  select * into a from public.cvc_accounts where user_id = auth.uid();
  if not found then return null; end if;
  ep := public.cvc_effective_plan(a.plan, a.plan_expires_at);
  return jsonb_build_object(
    'id', a.user_id, 'name', a.name, 'email', (select email from auth.users where id = a.user_id),
    'country', a.country, 'createdAt', a.created_at, 'isAdmin', exists (select 1 from public.cvc_admins where user_id = a.user_id),
    'plan', jsonb_build_object('id', ep, 'name', public.cvc_plan_name(ep), 'limits', public.cvc_plan_limits(ep),
      'expiresAt', case when ep = 'starter' then null else a.plan_expires_at end,
      'expired', (a.plan <> 'starter' and ep = 'starter'),
      'usage', jsonb_build_object('month', m, 'rewrites', case when a.usage_month = m then a.usage_rewrites else 0 end)));
end $$;

create or replace function public.cvc_spend_rewrite(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.cvc_accounts; m text := to_char(now(), 'YYYY-MM'); lim jsonb; used int; ep text;
begin
  select * into a from public.cvc_accounts where user_id = p_user for update;
  if not found then raise exception 'Account not set up.' using hint = 'no_account'; end if;
  ep := public.cvc_effective_plan(a.plan, a.plan_expires_at);
  lim := public.cvc_plan_limits(ep);
  used := case when a.usage_month = m then a.usage_rewrites else 0 end;
  if lim->'rewrites' <> 'null'::jsonb then
    if used >= (lim->>'rewrites')::int then
      raise exception 'You''ve used all % AI rewrites for this month. Upgrade for unlimited AI tailoring.', lim->>'rewrites' using hint = 'quota_exceeded';
    end if;
    update public.cvc_accounts set usage_month = m, usage_rewrites = used + 1 where user_id = p_user;
    used := used + 1;
  end if;
  return jsonb_build_object('id', ep, 'name', public.cvc_plan_name(ep), 'limits', lim, 'usage', jsonb_build_object('month', m, 'rewrites', used));
end $$;

create or replace function public.cvc_refund_rewrite(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.cvc_accounts set usage_rewrites = greatest(usage_rewrites - 1, 0)
  where user_id = p_user and usage_month = to_char(now(), 'YYYY-MM')
    and (public.cvc_plan_limits(public.cvc_effective_plan(plan, plan_expires_at))->'rewrites') <> 'null'::jsonb
$$;

create or replace function public.cvc_public_portfolio(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.cvc_portfolios; c jsonb; r public.cvc_resumes; acct public.cvc_accounts;
begin
  select * into p from public.cvc_portfolios where slug = lower(p_slug) and enabled;
  if not found then return null; end if;
  select * into acct from public.cvc_accounts where user_id = p.user_id;
  if public.cvc_effective_plan(acct.plan, acct.plan_expires_at) <> 'career' then return null; end if;
  if p.resume_id is not null then select * into r from public.cvc_resumes where id = p.resume_id and user_id = p.user_id; end if;
  c := coalesce(r.content, (select content from public.cvc_profiles where user_id = p.user_id), '{}'::jsonb);
  return jsonb_build_object(
    'name', coalesce(nullif(c->'personal'->>'fullName',''), acct.name),
    'headline', coalesce(nullif(p.headline,''), c->'personal'->>'headline', ''),
    'about', coalesce(nullif(p.about,''), c->>'summary', ''),
    'location', coalesce(c->'personal'->>'location', ''),
    'links', p.links,
    'skills', public.cvc_arr(c->'skills'),
    'experience', coalesce((select jsonb_agg(jsonb_build_object('role', e->>'role', 'company', e->>'company', 'start', e->>'start', 'end', e->>'end', 'current', (e->'current') = 'true'::jsonb, 'bullets', public.cvc_arr(e->'bullets'))) from jsonb_array_elements(public.cvc_arr(c->'experience')) e), '[]'),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('name', e->>'name', 'tech', e->>'tech', 'description', e->>'description')) from jsonb_array_elements(public.cvc_arr(c->'projects')) e), '[]'),
    'docId', r.doc_id);
end $$;

-- Production: nobody can pick a paid plan for free any more. Plans come from payments, redeem codes or an admin grant.
update public.cvc_settings set value = 'false'::jsonb where key = 'allow_self_serve_plan';

------------------------------------------------------------------ tables
create table public.cvc_admins (user_id uuid primary key references auth.users (id) on delete cascade, created_at timestamptz not null default now());

create table public.cvc_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tx_ref text not null unique,
  provider text not null default 'flutterwave',
  plan text not null check (plan in ('professional','career')),
  months int not null check (months in (1, 3, 12)),
  amount int not null check (amount > 0),
  currency text not null default 'UGX',
  status text not null default 'pending' check (status in ('pending','succeeded','failed','cancelled')),
  method text,
  provider_ref text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index cvc_payments_user_idx on public.cvc_payments (user_id, created_at desc);
create index cvc_payments_paid_idx on public.cvc_payments (paid_at) where status = 'succeeded';

create table public.cvc_redeem_codes (
  code text primary key check (code = upper(code)),
  plan text not null check (plan in ('professional','career')),
  days int not null check (days between 1 and 3660),
  max_uses int not null default 1 check (max_uses between 1 and 100000),
  uses int not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  note text not null default '' check (char_length(note) <= 200),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.cvc_redemptions (
  code text not null references public.cvc_redeem_codes (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);
create index cvc_redemptions_user_idx on public.cvc_redemptions (user_id);

create table public.cvc_code_attempts (id bigint generated always as identity primary key, user_id uuid not null, at timestamptz not null default now());
create index cvc_code_attempts_idx on public.cvc_code_attempts (user_id, at desc);

-- Privacy-light analytics: a random per-browser id, the page hash route and the referrer's host. No IP, no cookies.
create table public.cvc_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  visitor text not null,
  user_id uuid,
  kind text not null check (kind in ('view','signup','signin')),
  path text not null default '',
  ref text not null default ''
);
create index cvc_events_at_idx on public.cvc_events (at desc);
create index cvc_events_visitor_idx on public.cvc_events (visitor, at desc);

create table public.cvc_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  admin_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb
);

alter table public.cvc_admins enable row level security;
alter table public.cvc_payments enable row level security;
alter table public.cvc_redeem_codes enable row level security;
alter table public.cvc_redemptions enable row level security;
alter table public.cvc_code_attempts enable row level security;
alter table public.cvc_events enable row level security;
alter table public.cvc_audit enable row level security;
revoke all on public.cvc_admins, public.cvc_payments, public.cvc_redeem_codes, public.cvc_redemptions, public.cvc_code_attempts, public.cvc_events, public.cvc_audit from anon, authenticated;

-- People can read their own payment history; everything else goes through RPCs.
create policy cvc_payments_select on public.cvc_payments for select to authenticated using (user_id = (select auth.uid()));
grant select (id, tx_ref, plan, months, amount, currency, status, method, created_at, paid_at) on public.cvc_payments to authenticated;

------------------------------------------------------------------ helpers
create function public.cvc_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$ select exists (select 1 from public.cvc_admins where user_id = auth.uid()) $$;

create function public.cvc_assert_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.cvc_admins where user_id = auth.uid()) then
    raise exception 'Not authorised.' using hint = 'forbidden';
  end if;
end $$;

-- Gives (or extends) paid access. Same plan and still active: add on to the current expiry. Otherwise start now.
create function public.cvc_grant_access(p_user uuid, p_plan text, p_days int) returns void
language plpgsql security definer set search_path = '' as $$
declare a public.cvc_accounts; ep text; base timestamptz;
begin
  select * into a from public.cvc_accounts where user_id = p_user for update;
  if not found then raise exception 'Account not set up.' using hint = 'no_account'; end if;
  ep := public.cvc_effective_plan(a.plan, a.plan_expires_at);
  base := case when ep = p_plan and a.plan_expires_at is not null and a.plan_expires_at > now() then a.plan_expires_at else now() end;
  update public.cvc_accounts set plan = p_plan, plan_expires_at = base + make_interval(days => p_days) where user_id = p_user;
end $$;

------------------------------------------------------------------ payments (service role only: called by the payment Edge Functions)
create function public.cvc_start_payment(p_user uuid, p_plan text, p_months int, p_tx_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare amt int; a public.cvc_accounts;
begin
  if p_plan not in ('professional','career') then raise exception 'Choose a paid plan.'; end if;
  if p_months not in (1, 3, 12) then raise exception 'Choose 1, 3 or 12 months.'; end if;
  select * into a from public.cvc_accounts where user_id = p_user;
  if not found then raise exception 'Finish setting up your account first.' using hint = 'no_account'; end if;
  if public.cvc_plan_rank(public.cvc_effective_plan(a.plan, a.plan_expires_at)) > public.cvc_plan_rank(p_plan) then
    raise exception 'You already have a higher plan active.' using hint = 'higher_plan';
  end if;
  amt := public.cvc_plan_price(p_plan) * p_months;
  insert into public.cvc_payments (user_id, tx_ref, plan, months, amount, currency) values (p_user, p_tx_ref, p_plan, p_months, amt, 'UGX');
  return jsonb_build_object('amount', amt, 'currency', 'UGX', 'tx_ref', p_tx_ref, 'email', (select email from auth.users where id = p_user), 'name', a.name);
end $$;

-- Idempotent: safe to call from both the return page and the webhook. Checks the amount and currency the provider reports.
create function public.cvc_complete_payment(p_tx_ref text, p_provider_ref text, p_amount numeric, p_currency text, p_status text, p_method text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p public.cvc_payments;
begin
  select * into p from public.cvc_payments where tx_ref = p_tx_ref for update;
  if not found then raise exception 'Unknown payment.' using hint = 'unknown_payment'; end if;
  if p.status = 'succeeded' then return jsonb_build_object('status', 'succeeded', 'plan', p.plan, 'already', true); end if;
  if p_status = 'successful' and p_amount >= p.amount and upper(p_currency) = p.currency then
    update public.cvc_payments set status = 'succeeded', provider_ref = p_provider_ref, method = left(p_method, 40), paid_at = now() where id = p.id;
    perform public.cvc_grant_access(p.user_id, p.plan, p.months * 30);
    return jsonb_build_object('status', 'succeeded', 'plan', p.plan, 'already', false);
  elsif p_status = 'successful' then
    update public.cvc_payments set status = 'failed', provider_ref = p_provider_ref where id = p.id;  -- paid the wrong amount: flag for an admin, do not grant
    return jsonb_build_object('status', 'mismatch');
  elsif p_status in ('failed', 'cancelled') then
    update public.cvc_payments set status = p_status, provider_ref = p_provider_ref where id = p.id and status = 'pending';
    return jsonb_build_object('status', p_status);
  end if;
  return jsonb_build_object('status', 'pending');
end $$;

create function public.cvc_payment_owner(p_tx_ref text) returns uuid
language sql stable security definer set search_path = '' as $$ select user_id from public.cvc_payments where tx_ref = p_tx_ref $$;

revoke execute on function public.cvc_start_payment(uuid, text, int, text), public.cvc_complete_payment(text, text, numeric, text, text, text), public.cvc_payment_owner(text),
  public.cvc_grant_access(uuid, text, int) from public, anon, authenticated;
grant execute on function public.cvc_start_payment(uuid, text, int, text), public.cvc_complete_payment(text, text, numeric, text, text, text), public.cvc_payment_owner(text) to service_role;

------------------------------------------------------------------ redeem codes
create function public.cvc_redeem(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.cvc_redeem_codes; a public.cvc_accounts; ep text; norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')); shown text;
begin
  if auth.uid() is null then raise exception 'Please sign in to continue.' using hint = 'unauthenticated'; end if;
  if (select count(*) from public.cvc_code_attempts where user_id = auth.uid() and at > now() - interval '10 minutes') >= 6 then
    raise exception 'Too many attempts. Please wait a few minutes and try again.' using hint = 'rate_limited';
  end if;
  -- Codes are stored as CVC-XXXX-XXXX-XXXX; people may type them with or without dashes or spaces.
  shown := case when length(norm) = 15 and left(norm, 3) = 'CVC' then 'CVC-' || substr(norm, 4, 4) || '-' || substr(norm, 8, 4) || '-' || substr(norm, 12, 4) else norm end;
  select * into c from public.cvc_redeem_codes where code = shown for update;
  if not found or not c.active or (c.expires_at is not null and c.expires_at < now()) or c.uses >= c.max_uses then
    -- Returned, not raised: an exception would roll back the attempt record that rate-limits guessing.
    insert into public.cvc_code_attempts (user_id) values (auth.uid());
    return jsonb_build_object('error', 'bad_code', 'message', 'That code is not valid, or it has expired or been used up.');
  end if;
  if exists (select 1 from public.cvc_redemptions where code = c.code and user_id = auth.uid()) then
    raise exception 'You have already used this code.' using hint = 'already_redeemed';
  end if;
  select * into a from public.cvc_accounts where user_id = auth.uid();
  if not found then raise exception 'Finish setting up your account first.' using hint = 'no_account'; end if;
  ep := public.cvc_effective_plan(a.plan, a.plan_expires_at);
  if public.cvc_plan_rank(ep) > public.cvc_plan_rank(c.plan) then
    raise exception 'You already have a higher plan active, so this code was not used.' using hint = 'higher_plan';
  end if;
  insert into public.cvc_redemptions (code, user_id) values (c.code, auth.uid());
  update public.cvc_redeem_codes set uses = uses + 1 where code = c.code;
  perform public.cvc_grant_access(auth.uid(), c.plan, c.days);
  return public.cvc_me();
end $$;

------------------------------------------------------------------ analytics intake (anonymous visitors allowed)
create function public.cvc_track(p_visitor text, p_kind text, p_path text, p_ref text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('view','signup','signin') or coalesce(length(p_visitor), 0) not between 8 and 40 or p_visitor !~ '^[A-Za-z0-9_-]+$' then return; end if;
  if (select count(*) from public.cvc_events where visitor = p_visitor and at > now() - interval '1 minute') >= 30 then return; end if;
  insert into public.cvc_events (visitor, user_id, kind, path, ref) values (p_visitor, auth.uid(), p_kind, left(coalesce(p_path, ''), 120), left(coalesce(p_ref, ''), 80));
end $$;

------------------------------------------------------------------ admin console
create function public.cvc_admin_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz; m text := to_char(now(), 'YYYY-MM');
begin
  perform public.cvc_assert_admin();
  since := date_trunc('day', now()) - make_interval(days => d - 1);
  return jsonb_build_object(
    'days', d,
    'totals', jsonb_build_object(
      'users', (select count(*) from public.cvc_accounts),
      'paying', (select count(*) from public.cvc_accounts where public.cvc_effective_plan(plan, plan_expires_at) <> 'starter'),
      'resumes', (select count(*) from public.cvc_resumes),
      'letters', (select count(*) from public.cvc_letters),
      'certified', (select count(*) from public.cvc_docs),
      'aiRewritesThisMonth', (select coalesce(sum(usage_rewrites), 0) from public.cvc_accounts where usage_month = m),
      'revenueAllTime', (select coalesce(sum(amount), 0) from public.cvc_payments where status = 'succeeded')),
    'period', jsonb_build_object(
      'newUsers', (select count(*) from public.cvc_accounts where created_at >= since),
      'visitors', (select count(distinct visitor) from public.cvc_events where at >= since),
      'views', (select count(*) from public.cvc_events where at >= since and kind = 'view'),
      'signups', (select count(*) from public.cvc_events where at >= since and kind = 'signup'),
      'payments', (select count(*) from public.cvc_payments where status = 'succeeded' and paid_at >= since),
      'revenue', (select coalesce(sum(amount), 0) from public.cvc_payments where status = 'succeeded' and paid_at >= since),
      'redemptions', (select count(*) from public.cvc_redemptions where redeemed_at >= since)),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('plan', pl, 'count', n) order by pl), '[]') from (
      select public.cvc_effective_plan(plan, plan_expires_at) pl, count(*) n from public.cvc_accounts group by 1) x),
    'countries', (select coalesce(jsonb_agg(jsonb_build_object('country', country, 'count', n) order by n desc), '[]') from (
      select country, count(*) n from public.cvc_accounts group by country) x),
    'daily', (select jsonb_agg(jsonb_build_object('day', to_char(g, 'YYYY-MM-DD'),
        'visitors', (select count(distinct visitor) from public.cvc_events e where e.at >= g and e.at < g + interval '1 day'),
        'views', (select count(*) from public.cvc_events e where e.at >= g and e.at < g + interval '1 day' and e.kind = 'view'),
        'signups', (select count(*) from public.cvc_accounts a where a.created_at >= g and a.created_at < g + interval '1 day'),
        'revenue', (select coalesce(sum(amount), 0) from public.cvc_payments p where p.status = 'succeeded' and p.paid_at >= g and p.paid_at < g + interval '1 day')) order by g)
      from generate_series(since, date_trunc('day', now()), interval '1 day') g),
    'topPages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', n)), '[]') from (
      select path, count(*) n from public.cvc_events where at >= since and kind = 'view' group by path order by n desc limit 8) x),
    'topReferrers', (select coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'visitors', n)), '[]') from (
      select ref, count(distinct visitor) n from public.cvc_events where at >= since and ref <> '' group by ref order by n desc limit 8) x));
end $$;

create function public.cvc_admin_users(p_q text default '', p_limit int default 50, p_offset int default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := '%' || replace(replace(replace(lower(coalesce(p_q, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
begin
  perform public.cvc_assert_admin();
  return jsonb_build_object(
    'total', (select count(*) from public.cvc_accounts a join auth.users u on u.id = a.user_id where lower(a.name) like q or lower(u.email) like q),
    'rows', coalesce((select jsonb_agg(r) from (
      select jsonb_build_object('id', a.user_id, 'name', a.name, 'email', u.email, 'country', a.country,
        'plan', public.cvc_effective_plan(a.plan, a.plan_expires_at), 'expiresAt', a.plan_expires_at, 'createdAt', a.created_at,
        'resumes', (select count(*) from public.cvc_resumes r where r.user_id = a.user_id),
        'letters', (select count(*) from public.cvc_letters l where l.user_id = a.user_id)) r
      from public.cvc_accounts a join auth.users u on u.id = a.user_id
      where lower(a.name) like q or lower(u.email) like q
      order by a.created_at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)) s), '[]'));
end $$;

create function public.cvc_admin_payments(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cvc_assert_admin();
  return coalesce((select jsonb_agg(r) from (
    select jsonb_build_object('id', p.id, 'txRef', p.tx_ref, 'email', u.email, 'plan', p.plan, 'months', p.months, 'amount', p.amount, 'currency', p.currency,
      'status', p.status, 'method', p.method, 'createdAt', p.created_at, 'paidAt', p.paid_at) r
    from public.cvc_payments p left join auth.users u on u.id = p.user_id order by p.created_at desc limit least(greatest(p_limit, 1), 500)) s), '[]');
end $$;

create function public.cvc_admin_codes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cvc_assert_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('code', code, 'plan', plan, 'days', days, 'maxUses', max_uses, 'uses', uses, 'expiresAt', expires_at, 'active', active, 'note', note, 'createdAt', created_at) order by created_at desc)
    from (select * from public.cvc_redeem_codes order by created_at desc limit 500) c), '[]');
end $$;

create function public.cvc_admin_create_codes(p_plan text, p_days int, p_count int, p_max_uses int default 1, p_expires_at timestamptz default null, p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare n int := 0; made text[] := '{}'; h text; v_code text;
begin
  perform public.cvc_assert_admin();
  if p_plan not in ('professional','career') then raise exception 'Choose professional or career.'; end if;
  if p_days not between 1 and 3660 then raise exception 'Days must be between 1 and 3660.'; end if;
  if p_count not between 1 and 200 then raise exception 'Create between 1 and 200 codes at a time.'; end if;
  if p_max_uses not between 1 and 100000 then raise exception 'Max uses must be between 1 and 100000.'; end if;
  while n < p_count loop
    -- 12 unambiguous characters from a random UUID: no 0/O/1/I/L so codes can be read aloud or typed from a screenshot.
    h := upper(translate(encode(extensions.digest(gen_random_uuid()::text || clock_timestamp()::text, 'sha256'), 'hex'), '01ilo', 'PQRST'));
    v_code := 'CVC-' || substr(h, 1, 4) || '-' || substr(h, 5, 4) || '-' || substr(h, 9, 4);
    begin
      insert into public.cvc_redeem_codes (code, plan, days, max_uses, expires_at, note, created_by) values (v_code, p_plan, p_days, p_max_uses, p_expires_at, left(coalesce(p_note, ''), 200), auth.uid());
      made := made || v_code; n := n + 1;
    exception when unique_violation then null;
    end;
  end loop;
  insert into public.cvc_audit (admin_id, action, detail) values (auth.uid(), 'codes.create', jsonb_build_object('plan', p_plan, 'days', p_days, 'count', p_count, 'maxUses', p_max_uses, 'note', left(coalesce(p_note, ''), 200)));
  return to_jsonb(made);
end $$;

create function public.cvc_admin_set_code_active(p_code text, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cvc_assert_admin();
  update public.cvc_redeem_codes set active = p_active where code = upper(p_code);
  insert into public.cvc_audit (admin_id, action, detail) values (auth.uid(), case when p_active then 'code.enable' else 'code.disable' end, jsonb_build_object('code', upper(p_code)));
end $$;

-- Grant a plan for N days to one user (0 days returns them to Starter).
create function public.cvc_admin_grant(p_user uuid, p_plan text, p_days int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.cvc_assert_admin();
  if p_plan not in ('starter','professional','career') then raise exception 'Unknown plan.'; end if;
  if p_plan = 'starter' or p_days <= 0 then
    update public.cvc_accounts set plan = 'starter', plan_expires_at = null where user_id = p_user;
  else
    if p_days > 3660 then raise exception 'Days must be at most 3660.'; end if;
    update public.cvc_accounts set plan = p_plan, plan_expires_at = now() + make_interval(days => p_days) where user_id = p_user;
  end if;
  insert into public.cvc_audit (admin_id, action, detail) values (auth.uid(), 'user.grant', jsonb_build_object('user', p_user, 'plan', p_plan, 'days', p_days));
end $$;

create function public.cvc_admin_audit(p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cvc_assert_admin();
  return coalesce((select jsonb_agg(r) from (
    select jsonb_build_object('at', a.at, 'admin', u.email, 'action', a.action, 'detail', a.detail) r
    from public.cvc_audit a left join auth.users u on u.id = a.admin_id order by a.at desc limit least(greatest(p_limit, 1), 500)) s), '[]');
end $$;

-- Extend what the client may know about the app's configuration.
create or replace function public.cvc_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('selfServePlans', (select value from public.cvc_settings where key = 'allow_self_serve_plan'))
$$;

------------------------------------------------------------------ grants
revoke execute on function public.cvc_is_admin(), public.cvc_assert_admin(), public.cvc_redeem(text), public.cvc_track(text, text, text, text),
  public.cvc_admin_stats(int), public.cvc_admin_users(text, int, int), public.cvc_admin_payments(int), public.cvc_admin_codes(),
  public.cvc_admin_create_codes(text, int, int, int, timestamptz, text), public.cvc_admin_set_code_active(text, boolean),
  public.cvc_admin_grant(uuid, text, int), public.cvc_admin_audit(int), public.cvc_effective_plan(text, timestamptz), public.cvc_plan_rank(text), public.cvc_plan_price(text) from public, anon;
grant execute on function public.cvc_is_admin(), public.cvc_redeem(text),
  public.cvc_admin_stats(int), public.cvc_admin_users(text, int, int), public.cvc_admin_payments(int), public.cvc_admin_codes(),
  public.cvc_admin_create_codes(text, int, int, int, timestamptz, text), public.cvc_admin_set_code_active(text, boolean),
  public.cvc_admin_grant(uuid, text, int), public.cvc_admin_audit(int) to authenticated;
grant execute on function public.cvc_track(text, text, text, text) to anon, authenticated;
-- Helpers used inside other definer functions need no client access.
revoke execute on function public.cvc_assert_admin() from authenticated;
