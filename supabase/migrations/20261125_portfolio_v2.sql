-- Portfolio v2: availability line, theme, opt-in contact details, and richer public data (education, certifications, languages, verification).
alter table public.cvc_portfolios
  add column show_contact boolean not null default false,
  add column availability text not null default '' check (char_length(availability) <= 60),
  add column theme text not null default 'light' check (theme in ('light', 'dark'));

grant insert (show_contact, availability, theme), update (show_contact, availability, theme) on public.cvc_portfolios to authenticated;

create or replace function public.cvc_public_portfolio(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.cvc_portfolios; c jsonb; r public.cvc_resumes; acct public.cvc_accounts; d public.cvc_docs;
begin
  select * into p from public.cvc_portfolios where slug = lower(p_slug) and enabled;
  if not found then return null; end if;
  select * into acct from public.cvc_accounts where user_id = p.user_id;
  if p.resume_id is not null then select * into r from public.cvc_resumes where id = p.resume_id and user_id = p.user_id; end if;
  if r.doc_id is not null then select * into d from public.cvc_docs where id = r.doc_id; end if;
  c := coalesce(r.content, (select content from public.cvc_profiles where user_id = p.user_id), '{}'::jsonb);
  return jsonb_build_object(
    'name', coalesce(nullif(c->'personal'->>'fullName',''), acct.name),
    'headline', coalesce(nullif(p.headline,''), c->'personal'->>'headline', ''),
    'about', coalesce(nullif(p.about,''), c->>'summary', ''),
    'location', coalesce(c->'personal'->>'location', ''),
    'availability', p.availability,
    'theme', p.theme,
    'contact', case when p.show_contact then jsonb_build_object('email', coalesce(c->'personal'->>'email',''), 'phone', coalesce(c->'personal'->>'phone','')) else null end,
    'links', p.links,
    'skills', public.cvc_arr(c->'skills'),
    'experience', coalesce((select jsonb_agg(jsonb_build_object('role', e->>'role', 'company', e->>'company', 'location', e->>'location', 'start', e->>'start', 'end', e->>'end', 'current', (e->'current') = 'true'::jsonb, 'bullets', public.cvc_arr(e->'bullets'))) from jsonb_array_elements(public.cvc_arr(c->'experience')) e), '[]'),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('name', e->>'name', 'tech', e->>'tech', 'description', e->>'description', 'link', e->>'link')) from jsonb_array_elements(public.cvc_arr(c->'projects')) e), '[]'),
    'education', coalesce((select jsonb_agg(jsonb_build_object('school', e->>'school', 'degree', e->>'degree', 'field', e->>'field', 'start', e->>'start', 'end', e->>'end')) from jsonb_array_elements(public.cvc_arr(c->'education')) e), '[]'),
    'certifications', coalesce((select jsonb_agg(jsonb_build_object('name', e->>'name', 'issuer', e->>'issuer', 'year', e->>'year')) from jsonb_array_elements(public.cvc_arr(c->'certifications')) e), '[]'),
    'languages', coalesce((select jsonb_agg(jsonb_build_object('name', e->>'name', 'level', e->>'level')) from jsonb_array_elements(public.cvc_arr(c->'languages')) e), '[]'),
    'docId', case when d.id is not null and not d.revoked then d.id else null end,
    'issuedAt', case when d.id is not null and not d.revoked then d.issued_at else null end);
end $$;
