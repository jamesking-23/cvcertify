-- More resume templates and selectable cover-letter layouts.
alter table public.cvc_resumes drop constraint if exists cvc_resumes_template_check;
alter table public.cvc_resumes add constraint cvc_resumes_template_check check (template in ('classic','modern','compact','executive','academic','timeline','rail'));
alter table public.cvc_letters add column if not exists format text not null default 'formal' check (format in ('formal','right','letterhead'));
grant insert (format), update (format) on public.cvc_letters to authenticated;
