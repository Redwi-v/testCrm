create or replace function public.current_role () returns public.app_role language sql stable security definer
set
  search_path = public as $$ select case when password_change_required then null else role end from public.profiles where id=auth.uid() $$;
