create or replace function public.current_company_id () returns uuid language sql stable security definer
set
  search_path = public as $$ select company_id from public.profiles where id=auth.uid() $$;

create or replace function public.object_company_id (p_object uuid) returns uuid language sql stable security definer
set
  search_path = public as $$ select company_id from public.objects where id=p_object $$;

create or replace function public.user_can_access_object (p_object uuid, p_user uuid) returns boolean language sql stable security definer
set
  search_path = public as $$ select exists(select 1 from public.tasks where object_id=p_object and assignee_id=p_user) $$;

drop policy if exists company_read on public.companies;

drop policy if exists profile_read on public.profiles;

drop policy if exists profile_manager_update on public.profiles;

drop policy if exists object_company_read on public.objects;

drop policy if exists object_company_manager on public.objects;

drop policy if exists task_company_read on public.tasks;

drop policy if exists task_company_insert on public.tasks;

drop policy if exists task_company_update on public.tasks;

drop policy if exists task_company_delete on public.tasks;

drop policy if exists history_company_read on public.task_history;

create policy company_read on public.companies for
select
  to authenticated using (id = public.current_company_id ());

create policy profile_read on public.profiles for
select
  to authenticated using (
    company_id = public.current_company_id ()
    and (
      id = auth.uid ()
      or public.current_role () = 'manager'
    )
  );

create policy profile_manager_update on public.profiles
for update
  to authenticated using (
    public.current_role () = 'manager'
    and company_id = public.current_company_id ()
  )
with
  check (company_id = public.current_company_id ());

create policy object_company_read on public.objects for
select
  to authenticated using (
    company_id = public.current_company_id ()
    and (
      public.current_role () = 'manager'
      or public.user_can_access_object (id, auth.uid ())
    )
  );

create policy object_company_manager on public.objects for all to authenticated using (
  public.current_role () = 'manager'
  and company_id = public.current_company_id ()
)
with
  check (
    public.current_role () = 'manager'
    and company_id = public.current_company_id ()
  );

create policy task_company_read on public.tasks for
select
  to authenticated using (
    public.object_company_id (object_id) = public.current_company_id ()
    and (
      public.current_role () = 'manager'
      or assignee_id = auth.uid ()
    )
  );

create policy task_company_insert on public.tasks for insert to authenticated
with
  check (
    public.current_role () = 'manager'
    and author_id = auth.uid ()
    and status = 'Новая'
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

create policy task_company_delete on public.tasks for delete to authenticated using (
  public.current_role () = 'manager'
  and public.object_company_id (object_id) = public.current_company_id ()
);

create policy history_company_read on public.task_history for
select
  to authenticated using (
    public.object_company_id (
      (
        select
          object_id
        from
          public.tasks
        where
          id = task_id
      )
    ) = public.current_company_id ()
    and (
      public.current_role () = 'manager'
      or exists (
        select
          1
        from
          public.tasks t
        where
          t.id = task_id
          and t.assignee_id = auth.uid ()
      )
    )
  );
