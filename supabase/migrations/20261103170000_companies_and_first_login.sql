create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles
add column company_id uuid references public.companies (id) on delete cascade;

alter table public.profiles
add column password_change_required boolean not null default false;

alter table public.objects
add column company_id uuid references public.companies (id) on delete cascade;

insert into
  public.companies (name)
values
  ('СтройГрупп');

update public.profiles
set
  company_id = (
    select
      id
    from
      public.companies
    order by
      created_at
    limit
      1
  )
where
  company_id is null;

update public.objects
set
  company_id = (
    select
      id
    from
      public.companies
    order by
      created_at
    limit
      1
  )
where
  company_id is null;

alter table public.profiles
alter column company_id
set not null;

alter table public.objects
alter column company_id
set not null;

create index profiles_company_idx on public.profiles (company_id);

create index objects_company_idx on public.objects (company_id);

create or replace function public.current_role () returns public.app_role language sql stable security definer
set
  search_path = public as $$ select case when coalesce((auth.jwt()->'app_metadata'->>'password_change_required')::boolean,false) then null else role end from public.profiles where id=auth.uid() $$;

create function public.current_company_id () returns uuid language sql stable security definer
set
  search_path = public as $$ select company_id from public.profiles where id=auth.uid() $$;

create function public.object_company_id (p_object uuid) returns uuid language sql stable security definer
set
  search_path = public as $$ select company_id from public.objects where id=p_object $$;

create function public.user_can_access_object (p_object uuid, p_user uuid) returns boolean language sql stable security definer
set
  search_path = public as $$ select exists(select 1 from public.tasks where object_id=p_object and assignee_id=p_user) $$;

alter table public.companies enable row level security;

do $$ declare p record; begin for p in select policyname,tablename from pg_policies where schemaname='public' and tablename in ('profiles','objects','tasks','task_history') loop execute format('drop policy if exists %I on public.%I',p.policyname,p.tablename); end loop; end $$;

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
