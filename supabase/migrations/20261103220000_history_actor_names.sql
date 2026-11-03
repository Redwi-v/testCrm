drop policy if exists profile_read on public.profiles;

create policy profile_read on public.profiles for
select
  to authenticated using (company_id = public.current_company_id ());
