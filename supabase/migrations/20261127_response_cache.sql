-- Tier 2 of the assistant: a shared semantic answer cache. Answers written by Gemini (Tier 3) are stored with the
-- bge-small-en-v1.5 vector of the question, so a similar question later gets the stored answer for free.
-- Shared project, so the table keeps the cvc_ prefix. Only the Edge Function (service role) can touch it.

create extension if not exists vector with schema extensions;

create table if not exists public.cvc_response_cache (
  id uuid primary key default gen_random_uuid(),
  query_text text not null check (char_length(query_text) between 1 and 500),
  embedding extensions.vector(384) not null,
  response_text text not null check (char_length(response_text) between 1 and 6000),
  source_fact_ids text[] not null default '{}',   -- "factId:hash" of every app fact the answer was built from
  conditions text not null default '',            -- extracted conditions (such as country) that must match on a hit
  embedding_model text not null default 'bge-small-en-v1.5',
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
alter table public.cvc_response_cache enable row level security;       -- no policies: closed to the browser
revoke all on public.cvc_response_cache from anon, authenticated;

create index if not exists cvc_response_cache_vec on public.cvc_response_cache using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists cvc_response_cache_lru on public.cvc_response_cache (last_used_at);
create index if not exists cvc_response_cache_facts on public.cvc_response_cache using gin (source_fact_ids);

-- Nearest cached questions (best first). The caller applies its own checks before trusting a hit.
create or replace function public.cvc_cache_lookup(p_embedding text, p_min double precision, p_conditions text, p_limit int default 3)
returns table (id uuid, query_text text, response_text text, source_fact_ids text[], similarity double precision)
language sql stable security definer set search_path = public, extensions as $$
  select c.id, c.query_text, c.response_text, c.source_fact_ids, 1 - (c.embedding <=> p_embedding::extensions.vector) as similarity
  from public.cvc_response_cache c
  where c.conditions = coalesce(p_conditions, '') and c.embedding_model = 'bge-small-en-v1.5'
    and 1 - (c.embedding <=> p_embedding::extensions.vector) >= p_min
  order by c.embedding <=> p_embedding::extensions.vector
  limit greatest(1, least(p_limit, 10));
$$;

create or replace function public.cvc_cache_touch(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.cvc_response_cache set last_used_at = now(), hit_count = hit_count + 1 where id = p_id;
$$;

-- Saves an answer. Skips near-duplicates, then trims the table to p_cap entries, dropping the least recently used first.
create or replace function public.cvc_cache_store(p_query text, p_embedding text, p_response text, p_facts text[], p_conditions text, p_cap int default 10000)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  select c.id into v_id from public.cvc_response_cache c
   where c.conditions = coalesce(p_conditions, '') and 1 - (c.embedding <=> p_embedding::extensions.vector) >= 0.97
   order by c.embedding <=> p_embedding::extensions.vector limit 1;
  if v_id is not null then
    update public.cvc_response_cache set last_used_at = now() where id = v_id;
    return v_id;
  end if;
  insert into public.cvc_response_cache (query_text, embedding, response_text, source_fact_ids, conditions)
  values (left(p_query, 500), p_embedding::extensions.vector, left(p_response, 6000), coalesce(p_facts, '{}'), coalesce(p_conditions, ''))
  returning id into v_id;
  delete from public.cvc_response_cache where id in (
    select id from public.cvc_response_cache order by last_used_at asc offset greatest(p_cap, 100));
  return v_id;
end $$;

-- Call when an app fact changes: removes every cached answer that was built from it.
create or replace function public.cvc_cache_invalidate_fact(p_fact_id text) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.cvc_response_cache c
   where exists (select 1 from unnest(c.source_fact_ids) f where split_part(f, ':', 1) = p_fact_id);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.cvc_cache_delete(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.cvc_response_cache where id = any(p_ids);
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.cvc_cache_lookup(text, double precision, text, int), public.cvc_cache_touch(uuid),
  public.cvc_cache_store(text, text, text, text[], text, int), public.cvc_cache_invalidate_fact(text), public.cvc_cache_delete(uuid[])
  from public, anon, authenticated;
grant execute on function public.cvc_cache_lookup(text, double precision, text, int), public.cvc_cache_touch(uuid),
  public.cvc_cache_store(text, text, text, text[], text, int), public.cvc_cache_invalidate_fact(text), public.cvc_cache_delete(uuid[])
  to service_role;
