-- Everything is free. Every plan id now maps to the same full feature set, so any leftover account rows behave identically.
-- AI actions keep a monthly fair-use cap (200) so the free AI quota lasts for everyone. Payment tables and functions stay but are unused.
create or replace function public.cvc_plan_limits(p text) returns jsonb
language sql immutable set search_path = '' as $$
  select '{"resumes":null,"rewrites":200,"letters":true,"ats":true,"interview":true,"roadmap":true,"portfolio":true}'::jsonb
$$;

create or replace function public.cvc_plan_name(p text) returns text
language sql immutable set search_path = '' as $$ select 'Free' $$;

-- Everyone is on the single free plan, with no expiry.
update public.cvc_accounts set plan = 'starter', plan_expires_at = null where plan <> 'starter' or plan_expires_at is not null;

-- Portfolios are no longer restricted to a paid plan: patch the public lookup in place.
do $$
declare d text := pg_get_functiondef('public.cvc_public_portfolio(text)'::regprocedure);
begin
  d := replace(d, E'  if public.cvc_effective_plan(acct.plan, acct.plan_expires_at) <> ''career'' then return null; end if;\n', '');
  execute d;
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
      raise exception 'You''ve reached the fair-use limit of % AI actions for this month. It resets on the 1st. Everything else stays available.', lim->>'rewrites' using hint = 'quota_exceeded';
    end if;
    update public.cvc_accounts set usage_month = m, usage_rewrites = used + 1 where user_id = p_user;
    used := used + 1;
  end if;
  return jsonb_build_object('id', ep, 'name', public.cvc_plan_name(ep), 'limits', lim, 'usage', jsonb_build_object('month', m, 'rewrites', used));
end $$;
