-- CV-Certify schema. Every object is prefixed cvc_ so it can share a Supabase project with other apps.
-- Row Level Security is enabled on every table; clients can only touch their own rows.
-- Nothing here touches auth.users (no triggers), so other apps in the project are unaffected.

------------------------------------------------------------------ settings (server-only)
create table public.cvc_settings (key text primary key, value jsonb not null);
alter table public.cvc_settings enable row level security;          -- no policies: only SECURITY DEFINER code reads it
insert into public.cvc_settings values ('allow_self_serve_plan', 'true');  -- demo mode until payments exist

------------------------------------------------------------------ plans
create function public.cvc_plan_limits(p text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p
    when 'starter'      then '{"resumes":2,"rewrites":3,"letters":false,"ats":false,"interview":false,"roadmap":false,"portfolio":false}'::jsonb
    when 'professional' then '{"resumes":null,"rewrites":null,"letters":true,"ats":true,"interview":true,"roadmap":false,"portfolio":false}'::jsonb
    when 'career'       then '{"resumes":null,"rewrites":null,"letters":true,"ats":true,"interview":true,"roadmap":true,"portfolio":true}'::jsonb
  end
$$;

create function public.cvc_plan_name(p text) returns text
language sql immutable set search_path = '' as $$
  select case p when 'starter' then 'Starter' when 'professional' then 'Professional' when 'career' then 'Career+' end
$$;

------------------------------------------------------------------ tables
create table public.cvc_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '' check (char_length(name) <= 120),
  country text not null default 'US' check (country in ('US','CA','UK','EU','AF','AU','IN','ME')),
  plan text not null default 'starter' check (plan in ('starter','professional','career')),
  usage_month text not null default '',
  usage_rewrites int not null default 0,
  created_at timestamptz not null default now()
);

create table public.cvc_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 200000),
  updated_at timestamptz not null default now()
);

create table public.cvc_resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null default 'My resume' check (char_length(title) between 1 and 120),
  template text not null default 'classic' check (template in ('classic','modern','compact','executive')),
  country text not null default 'US' check (country in ('US','CA','UK','EU','AF','AU','IN','ME')),
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) < 200000),
  job jsonb not null default '{}'::jsonb check (jsonb_typeof(job) = 'object' and pg_column_size(job) < 30000),
  doc_id text,
  certified_at timestamptz,
  certified_hash text,
  current_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cvc_resumes_user_idx on public.cvc_resumes (user_id, updated_at desc);

create table public.cvc_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title text not null default 'Cover letter' check (char_length(title) between 1 and 120),
  text text not null default '' check (char_length(text) <= 8000),
  job jsonb not null default '{}'::jsonb check (jsonb_typeof(job) = 'object' and pg_column_size(job) < 30000),
  resume_id uuid references public.cvc_resumes (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cvc_letters_user_idx on public.cvc_letters (user_id, updated_at desc);

create table public.cvc_docs (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'resume',
  holder text not null,
  headline text not null default '',
  title text not null default '',
  hash text not null,
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked boolean not null default false,
  revoked_reason text,
  history jsonb not null default '[]'::jsonb,
  snapshot jsonb
);
create index cvc_docs_owner_idx on public.cvc_docs (owner_id);

create table public.cvc_portfolios (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  enabled boolean not null default false,
  slug text unique check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  headline text not null default '' check (char_length(headline) <= 160),
  about text not null default '' check (char_length(about) <= 1500),
  links jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array' and pg_column_size(links) < 8000),
  resume_id uuid references public.cvc_resumes (id) on delete set null,
  updated_at timestamptz not null default now()
);

------------------------------------------------------------------ triggers
create function public.cvc_my_plan(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select plan from public.cvc_accounts where user_id = p_user), 'starter')
$$;
revoke execute on function public.cvc_my_plan(uuid) from public, anon, authenticated;

create function public.cvc_resumes_biu() returns trigger
language plpgsql security definer set search_path = '' as $$
declare lim jsonb; n int;
begin
  if tg_op = 'INSERT' then
    lim := public.cvc_plan_limits(public.cvc_my_plan(new.user_id));
    if lim->'resumes' <> 'null'::jsonb then
      select count(*) into n from public.cvc_resumes where user_id = new.user_id;
      if n >= (lim->>'resumes')::int then
        raise exception 'Your plan includes % resumes. Upgrade for unlimited resumes and versions.', lim->>'resumes' using hint = 'quota_exceeded';
      end if;
    end if;
  end if;
  new.current_hash := encode(extensions.digest(convert_to(jsonb_build_object('c', new.content, 't', new.template, 'k', new.country)::text, 'UTF8'), 'sha256'), 'hex');
  new.updated_at := now();
  return new;
end $$;
create trigger cvc_resumes_biu before insert or update on public.cvc_resumes for each row execute function public.cvc_resumes_biu();

create function public.cvc_letters_biu() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (public.cvc_plan_limits(public.cvc_my_plan(new.user_id))->>'letters') <> 'true' then
    raise exception 'Cover letters are available on Professional.' using hint = 'upgrade_required';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger cvc_letters_biu before insert or update on public.cvc_letters for each row execute function public.cvc_letters_biu();

create function public.cvc_portfolios_biu() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (public.cvc_plan_limits(public.cvc_my_plan(new.user_id))->>'portfolio') <> 'true' then
    raise exception 'Portfolio hosting is available on Career+.' using hint = 'upgrade_required';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger cvc_portfolios_biu before insert or update on public.cvc_portfolios for each row execute function public.cvc_portfolios_biu();

create function public.cvc_profiles_biu() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger cvc_profiles_biu before insert or update on public.cvc_profiles for each row execute function public.cvc_profiles_biu();

------------------------------------------------------------------ RLS + column privileges
alter table public.cvc_accounts   enable row level security;
alter table public.cvc_profiles   enable row level security;
alter table public.cvc_resumes    enable row level security;
alter table public.cvc_letters    enable row level security;
alter table public.cvc_docs       enable row level security;
alter table public.cvc_portfolios enable row level security;

create policy cvc_accounts_select on public.cvc_accounts for select to authenticated using (user_id = (select auth.uid()));
create policy cvc_accounts_update on public.cvc_accounts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy cvc_profiles_all on public.cvc_profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cvc_resumes_all on public.cvc_resumes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cvc_letters_all on public.cvc_letters for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (resume_id is null or exists (select 1 from public.cvc_resumes r where r.id = resume_id and r.user_id = (select auth.uid()))));
create policy cvc_docs_select on public.cvc_docs for select to authenticated using (owner_id = (select auth.uid()));
create policy cvc_portfolios_all on public.cvc_portfolios for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (resume_id is null or exists (select 1 from public.cvc_resumes r where r.id = resume_id and r.user_id = (select auth.uid()))));

-- Clients may only write the columns below. Plan, usage, certification fields are server-controlled.
revoke all on public.cvc_accounts, public.cvc_profiles, public.cvc_resumes, public.cvc_letters, public.cvc_docs, public.cvc_portfolios, public.cvc_settings from anon, authenticated;
grant select on public.cvc_accounts to authenticated;
grant update (name, country) on public.cvc_accounts to authenticated;
grant select, delete on public.cvc_profiles to authenticated;
grant insert (content), update (content) on public.cvc_profiles to authenticated;
grant select, delete on public.cvc_resumes to authenticated;
grant insert (title, template, country, content, job), update (title, template, country, content, job) on public.cvc_resumes to authenticated;
grant select, delete on public.cvc_letters to authenticated;
grant insert (title, text, job, resume_id), update (title, text, job, resume_id) on public.cvc_letters to authenticated;
grant select on public.cvc_docs to authenticated;
grant select, delete on public.cvc_portfolios to authenticated;
grant insert (enabled, slug, headline, about, links, resume_id), update (enabled, slug, headline, about, links, resume_id) on public.cvc_portfolios to authenticated;

------------------------------------------------------------------ account RPCs
create function public.cvc_me() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare a public.cvc_accounts; m text := to_char(now(), 'YYYY-MM');
begin
  select * into a from public.cvc_accounts where user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object(
    'id', a.user_id, 'name', a.name, 'email', (select email from auth.users where id = a.user_id),
    'country', a.country, 'createdAt', a.created_at,
    'plan', jsonb_build_object('id', a.plan, 'name', public.cvc_plan_name(a.plan), 'limits', public.cvc_plan_limits(a.plan),
      'usage', jsonb_build_object('month', m, 'rewrites', case when a.usage_month = m then a.usage_rewrites else 0 end)));
end $$;

create function public.cvc_ensure_account() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u auth.users; nm text;
begin
  if auth.uid() is null then raise exception 'Please sign in to continue.' using hint = 'unauthenticated'; end if;
  select * into u from auth.users where id = auth.uid();
  nm := coalesce(nullif(trim(u.raw_user_meta_data->>'name'), ''), nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1));
  insert into public.cvc_accounts (user_id, name) values (u.id, left(nm, 120)) on conflict do nothing;
  insert into public.cvc_profiles (user_id, content) values (u.id, jsonb_build_object(
    'personal', jsonb_build_object('fullName', left(nm,200), 'headline','', 'email', coalesce(u.email,''), 'phone','', 'location','', 'website','', 'linkedin','', 'github','', 'dob','', 'nationality',''),
    'summary','', 'experience','[]'::jsonb, 'education','[]'::jsonb, 'projects','[]'::jsonb, 'skills','[]'::jsonb,
    'certifications','[]'::jsonb, 'languages','[]'::jsonb, 'referees','[]'::jsonb)) on conflict do nothing;
  return public.cvc_me();
end $$;

create function public.cvc_set_plan(p_plan text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in to continue.' using hint = 'unauthenticated'; end if;
  if p_plan not in ('starter','professional','career') then raise exception 'Unknown plan.'; end if;
  if (select value from public.cvc_settings where key = 'allow_self_serve_plan') <> 'true'::jsonb then
    raise exception 'Plan changes are handled through billing. Payments are not enabled yet.' using hint = 'billing_required';
  end if;
  update public.cvc_accounts set plan = p_plan where user_id = auth.uid();
  return public.cvc_me();
end $$;

create function public.cvc_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('selfServePlans', (select value from public.cvc_settings where key = 'allow_self_serve_plan'))
$$;

-- Removes this app's data only. The login itself is shared with other apps in the project, so it is kept.
create function public.cvc_delete_my_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Please sign in to continue.' using hint = 'unauthenticated'; end if;
  update public.cvc_docs set revoked = true, revoked_reason = 'Account deleted', snapshot = null, updated_at = now() where owner_id = auth.uid();
  delete from public.cvc_portfolios where user_id = auth.uid();
  delete from public.cvc_letters where user_id = auth.uid();
  delete from public.cvc_resumes where user_id = auth.uid();
  delete from public.cvc_profiles where user_id = auth.uid();
  delete from public.cvc_accounts where user_id = auth.uid();
end $$;

------------------------------------------------------------------ certification
create function public.cvc_new_doc_id() returns text
language plpgsql volatile set search_path = '' as $$
declare alpha constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; b bytea := extensions.gen_random_bytes(12); s text := ''; i int;
begin
  for i in 0..11 loop s := s || substr(alpha, (get_byte(b, i) % 31) + 1, 1); end loop;
  return 'CVC-' || substr(s,1,4) || '-' || substr(s,5,4) || '-' || substr(s,9,4);
end $$;
revoke execute on function public.cvc_new_doc_id() from public, anon, authenticated;

create function public.cvc_arr(j jsonb) returns jsonb
language sql immutable set search_path = '' as $$ select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;

create function public.cvc_certify(p_resume_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.cvc_resumes; d public.cvc_docs; did text; c jsonb; snap jsonb; hist jsonb; tries int := 0;
begin
  select * into r from public.cvc_resumes where id = p_resume_id and user_id = auth.uid() for update;
  if not found then raise exception 'Resume not found.' using hint = 'not_found'; end if;
  c := r.content;
  if coalesce(trim(c->'personal'->>'fullName'), '') = '' then raise exception 'Add your full name before certifying this document.'; end if;
  if r.doc_id is not null and r.certified_hash = r.current_hash then
    return jsonb_build_object('docId', r.doc_id, 'certifiedAt', r.certified_at, 'certifiedHash', r.certified_hash, 'unchanged', true);
  end if;
  snap := jsonb_build_object(
    'fullName', c->'personal'->>'fullName', 'headline', c->'personal'->>'headline', 'location', c->'personal'->>'location', 'summary', c->>'summary',
    'experience', coalesce((select jsonb_agg(jsonb_build_object('role', e->>'role', 'company', e->>'company', 'start', e->>'start', 'end', e->>'end', 'current', (e->'current') = 'true'::jsonb)) from jsonb_array_elements(public.cvc_arr(c->'experience')) e), '[]'),
    'education', coalesce((select jsonb_agg(jsonb_build_object('school', e->>'school', 'degree', e->>'degree', 'field', e->>'field', 'end', e->>'end')) from jsonb_array_elements(public.cvc_arr(c->'education')) e), '[]'),
    'certifications', coalesce((select jsonb_agg(jsonb_build_object('name', e->>'name', 'issuer', e->>'issuer', 'year', e->>'year')) from jsonb_array_elements(public.cvc_arr(c->'certifications')) e), '[]'),
    'skills', public.cvc_arr(c->'skills'));
  did := r.doc_id;
  select * into d from public.cvc_docs where id = did;
  hist := (coalesce(d.history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now(), 'hash', r.current_hash)));
  if jsonb_array_length(hist) > 20 then hist := (select jsonb_agg(x) from (select x from jsonb_array_elements(hist) x offset jsonb_array_length(hist) - 20) t); end if;
  if did is null then
    loop
      did := public.cvc_new_doc_id();
      begin
        insert into public.cvc_docs (id, owner_id, holder, headline, title, hash, history, snapshot)
        values (did, auth.uid(), c->'personal'->>'fullName', coalesce(c->'personal'->>'headline', ''), r.title, r.current_hash, hist, snap);
        exit;
      exception when unique_violation then
        tries := tries + 1; if tries > 5 then raise; end if;
      end;
    end loop;
  else
    update public.cvc_docs set holder = c->'personal'->>'fullName', headline = coalesce(c->'personal'->>'headline', ''), title = r.title,
      hash = r.current_hash, history = hist, snapshot = snap, updated_at = now(), revoked = false, revoked_reason = null where id = did;
  end if;
  update public.cvc_resumes set doc_id = did, certified_at = now(), certified_hash = r.current_hash where id = r.id;
  return jsonb_build_object('docId', did, 'certifiedAt', now(), 'certifiedHash', r.current_hash, 'unchanged', false);
end $$;

create function public.cvc_revoke(p_resume_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.cvc_resumes;
begin
  select * into r from public.cvc_resumes where id = p_resume_id and user_id = auth.uid() for update;
  if not found then raise exception 'Resume not found.' using hint = 'not_found'; end if;
  if r.doc_id is null then raise exception 'This resume has not been certified.'; end if;
  update public.cvc_docs set revoked = true, revoked_reason = 'Revoked by owner', updated_at = now() where id = r.doc_id;
  -- Detach so the next certification issues a brand-new ID (a revoked ID is never reused).
  update public.cvc_resumes set doc_id = null, certified_at = null, certified_hash = null where id = r.id;
end $$;

-- Public: anyone (no login) may look up a document ID. Returns only what the holder certified, never contact details.
create function public.cvc_verify(p_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v text; did text; d public.cvc_docs;
begin
  v := regexp_replace(upper(coalesce(p_id, '')), '[^A-Z0-9]', '', 'g');
  v := regexp_replace(v, '^CVC', '');
  if length(v) < 12 then return null; end if;
  did := 'CVC-' || substr(v,1,4) || '-' || substr(v,5,4) || '-' || substr(v,9,4);
  select * into d from public.cvc_docs where id = did;
  if not found then return null; end if;
  return jsonb_build_object(
    'id', d.id, 'status', case when d.revoked then 'revoked' else 'valid' end,
    'revokedReason', case when d.revoked then d.revoked_reason end,
    'holder', d.holder, 'headline', d.headline, 'kind', d.kind, 'issuedAt', d.issued_at, 'updatedAt', d.updated_at,
    'revisions', jsonb_array_length(d.history), 'snapshot', case when d.revoked then null else d.snapshot end,
    'note', 'CV-Certify confirms this document was issued from this account and has not been altered since. It does not independently verify employers or qualifications.');
end $$;

------------------------------------------------------------------ public portfolio
create function public.cvc_public_portfolio(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.cvc_portfolios; c jsonb; r public.cvc_resumes; acct public.cvc_accounts;
begin
  select * into p from public.cvc_portfolios where slug = lower(p_slug) and enabled;
  if not found then return null; end if;
  select * into acct from public.cvc_accounts where user_id = p.user_id;
  if acct.plan <> 'career' then return null; end if;
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

------------------------------------------------------------------ server-only helpers (called by the Edge Function with the service role)
create function public.cvc_require_feature(p_user uuid, p_feature text) returns void
language plpgsql security definer set search_path = '' as $$
declare pl text := public.cvc_my_plan(p_user);
begin
  if (public.cvc_plan_limits(pl)->>p_feature) is distinct from 'true' then
    raise exception 'This feature is available on %.', case p_feature when 'roadmap' then 'Career+' else 'Professional' end using hint = 'upgrade_required';
  end if;
end $$;

create function public.cvc_spend_rewrite(p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a public.cvc_accounts; m text := to_char(now(), 'YYYY-MM'); lim jsonb; used int;
begin
  select * into a from public.cvc_accounts where user_id = p_user for update;
  if not found then raise exception 'Account not set up.' using hint = 'no_account'; end if;
  lim := public.cvc_plan_limits(a.plan);
  used := case when a.usage_month = m then a.usage_rewrites else 0 end;
  if lim->'rewrites' <> 'null'::jsonb then
    if used >= (lim->>'rewrites')::int then
      raise exception 'You''ve used all % AI rewrites for this month. Upgrade for unlimited AI tailoring.', lim->>'rewrites' using hint = 'quota_exceeded';
    end if;
    update public.cvc_accounts set usage_month = m, usage_rewrites = used + 1 where user_id = p_user;
    used := used + 1;
  end if;
  return jsonb_build_object('id', a.plan, 'name', public.cvc_plan_name(a.plan), 'limits', lim, 'usage', jsonb_build_object('month', m, 'rewrites', used));
end $$;

create function public.cvc_refund_rewrite(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  update public.cvc_accounts set usage_rewrites = greatest(usage_rewrites - 1, 0)
  where user_id = p_user and usage_month = to_char(now(), 'YYYY-MM') and (public.cvc_plan_limits(plan)->'rewrites') <> 'null'::jsonb
$$;

revoke execute on function public.cvc_require_feature(uuid, text), public.cvc_spend_rewrite(uuid), public.cvc_refund_rewrite(uuid) from public, anon, authenticated;
grant execute on function public.cvc_require_feature(uuid, text), public.cvc_spend_rewrite(uuid), public.cvc_refund_rewrite(uuid) to service_role;

------------------------------------------------------------------ function grants
revoke execute on function public.cvc_me(), public.cvc_ensure_account(), public.cvc_set_plan(text), public.cvc_delete_my_data(),
  public.cvc_certify(uuid), public.cvc_revoke(uuid), public.cvc_resumes_biu(), public.cvc_letters_biu(), public.cvc_portfolios_biu() from public, anon;
grant execute on function public.cvc_me(), public.cvc_ensure_account(), public.cvc_set_plan(text), public.cvc_delete_my_data(),
  public.cvc_certify(uuid), public.cvc_revoke(uuid) to authenticated;
revoke execute on function public.cvc_resumes_biu(), public.cvc_letters_biu(), public.cvc_portfolios_biu() from authenticated;
grant execute on function public.cvc_verify(text), public.cvc_public_portfolio(text), public.cvc_config() to anon, authenticated;
