-- Writing now runs offline on our own servers with no external AI service, so the monthly fair-use cap is removed.
create or replace function public.cvc_plan_limits(p text) returns jsonb
language sql immutable set search_path = '' as $$
  select '{"resumes":null,"rewrites":null,"letters":true,"ats":true,"interview":true,"roadmap":true,"portfolio":true}'::jsonb
$$;
