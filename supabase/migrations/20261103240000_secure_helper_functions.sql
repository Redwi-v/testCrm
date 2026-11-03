create or replace function public.object_company_id (p_object uuid) returns uuid language sql stable security definer
set
  search_path = public as $$ select company_id from public.objects where id=p_object and archived_at is null and company_id=public.current_company_id() $$;

create or replace function public.user_can_access_object (p_object uuid, p_user uuid) returns boolean language sql stable security definer
set
  search_path = public as $$ select p_user=auth.uid() and public.object_company_id(p_object)=public.current_company_id() and exists(select 1 from public.tasks where object_id=p_object and assignee_id=auth.uid() and archived_at is null) $$;

revoke all on function public.current_company_id ()
from
  public,
  anon;

revoke all on function public.current_role ()
from
  public,
  anon;

revoke all on function public.object_company_id (uuid)
from
  public,
  anon;

revoke all on function public.user_can_access_object (uuid, uuid)
from
  public,
  anon;

grant
execute on function public.current_company_id () to authenticated;

grant
execute on function public.current_role () to authenticated;

grant
execute on function public.object_company_id (uuid) to authenticated;

grant
execute on function public.user_can_access_object (uuid, uuid) to authenticated;
