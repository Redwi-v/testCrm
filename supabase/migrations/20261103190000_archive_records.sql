alter table public.objects
add column archived_at timestamptz;

alter table public.tasks
add column archived_at timestamptz;

drop policy if exists object_company_read on public.objects;

create policy object_company_read on public.objects for
select
  to authenticated using (
    archived_at is null
    and company_id = public.current_company_id ()
    and (
      public.current_role () = 'manager'
      or public.user_can_access_object (id, auth.uid ())
    )
  );

drop policy if exists object_company_manager on public.objects;

create policy object_company_manager on public.objects for insert to authenticated
with
  check (
    public.current_role () = 'manager'
    and company_id = public.current_company_id ()
  );

create policy object_manager_update on public.objects
for update
  to authenticated using (
    public.current_role () = 'manager'
    and company_id = public.current_company_id ()
  )
with
  check (company_id = public.current_company_id ());

drop policy if exists task_company_read on public.tasks;

create policy task_company_read on public.tasks for
select
  to authenticated using (
    archived_at is null
    and public.object_company_id (object_id) = public.current_company_id ()
    and (
      public.current_role () = 'manager'
      or assignee_id = auth.uid ()
    )
  );

drop policy if exists task_company_insert on public.tasks;

create policy task_company_insert on public.tasks for insert to authenticated
with
  check (
    public.current_role () = 'manager'
    and author_id = auth.uid ()
    and status = 'Новая'
    and archived_at is null
    and public.object_company_id (object_id) = public.current_company_id ()
    and exists (
      select
        1
      from
        public.profiles a
      where
        a.id = assignee_id
        and a.company_id = public.current_company_id ()
    )
  );

drop policy if exists task_company_update on public.tasks;

create policy task_company_update on public.tasks
for update
  to authenticated using (
    public.object_company_id (object_id) = public.current_company_id ()
    and (
      public.current_role () = 'manager'
      or assignee_id = auth.uid ()
    )
  )
with
  check (
    public.object_company_id (object_id) = public.current_company_id ()
    and (
      public.current_role () = 'manager'
      or assignee_id = auth.uid ()
    )
  );

revoke delete on public.objects,
public.tasks
from
  authenticated;
