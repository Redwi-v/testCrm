-- Apply in Supabase SQL Editor. Create users in Auth manually, then add profiles.
create type public.app_role as enum('manager', 'executor');

create type public.task_status as enum(
  'Новая',
  'В работе',
  'На проверке',
  'Принята',
  'На доработке'
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.app_role not null
);

create table public.objects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  object_id uuid not null references public.objects (id) on delete cascade,
  assignee_id uuid not null references public.profiles (id),
  author_id uuid not null references public.profiles (id),
  status public.task_status not null default 'Новая',
  created_at timestamptz not null default now()
);

create table public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  actor_id uuid not null references public.profiles (id),
  from_status public.task_status,
  to_status public.task_status not null,
  comment text,
  created_at timestamptz not null default now()
);

create index tasks_assignee_idx on public.tasks (assignee_id);

create index tasks_object_idx on public.tasks (object_id);

create function public.current_role () returns public.app_role language sql stable security definer
set
  search_path = public as $$ select role from public.profiles where id=auth.uid() $$;

create function public.log_task_create () returns trigger language plpgsql security definer
set
  search_path = public as $$ begin insert into public.task_history(task_id,actor_id,from_status,to_status) values(new.id,auth.uid(),null,new.status); return new; end $$;

create trigger task_created_history
after insert on public.tasks for each row
execute function public.log_task_create ();

create function public.enforce_task_transition () returns trigger language plpgsql security definer
set
  search_path = public as $$ declare r public.app_role; begin
 if new.title is distinct from old.title or new.description is distinct from old.description or new.object_id is distinct from old.object_id or new.assignee_id is distinct from old.assignee_id then if public.current_role()<>'manager' then raise exception 'Only managers may edit task details'; end if; end if;
 if new.status is distinct from old.status then r:=public.current_role(); if (old.status='Новая' and new.status='В работе') or (old.status='На доработке' and new.status='В работе') or (old.status='В работе' and new.status='На проверке') then if r<>'executor' or old.assignee_id<>auth.uid() then raise exception 'Only the assigned executor may perform this transition'; end if;
 elsif old.status='На проверке' and new.status in ('Принята','На доработке') then if r<>'manager' then raise exception 'Only managers may review tasks'; end if;
 else raise exception 'Invalid status transition'; end if;
 if new.status='На доработке' and nullif(btrim(current_setting('app.review_comment',true)),'') is null then raise exception 'A comment is required'; end if;
 end if; return new; end $$;

create trigger task_transition_guard
before update on public.tasks for each row
execute function public.enforce_task_transition ();

create function public.change_task_status (
  p_task uuid,
  p_status public.task_status,
  p_comment text default null
) returns void language plpgsql security definer
set
  search_path = public as $$ begin perform set_config('app.review_comment',coalesce(p_comment,''),true); update public.tasks set status=p_status where id=p_task; if not found then raise exception 'Task not found'; end if; end $$;

create function public.log_task_status () returns trigger language plpgsql security definer
set
  search_path = public as $$ begin if new.status is distinct from old.status then insert into public.task_history(task_id,actor_id,from_status,to_status,comment) values(new.id,auth.uid(),old.status,new.status,nullif(btrim(current_setting('app.review_comment',true)),'')); end if; return new; end $$;

create trigger task_status_history
after update on public.tasks for each row
execute function public.log_task_status ();

create function public.deny_history_mutation () returns trigger language plpgsql as $$ begin raise exception 'Task history is immutable'; end $$;

create trigger history_immutable
before update or delete on public.task_history for each row
execute function public.deny_history_mutation ();

alter table public.profiles enable row level security;

alter table public.objects enable row level security;

alter table public.tasks enable row level security;

alter table public.task_history enable row level security;

create policy profiles_read on public.profiles for
select
  to authenticated using (
    id = auth.uid ()
    or public.current_role () = 'manager'
    or exists (
      select
        1
      from
        public.tasks t
      where
        t.assignee_id = auth.uid ()
        and t.author_id = profiles.id
    )
  );

create policy manager_profiles on public.profiles for all to authenticated using (public.current_role () = 'manager')
with
  check (public.current_role () = 'manager');

create policy objects_read on public.objects for
select
  to authenticated using (
    public.current_role () = 'manager'
    or exists (
      select
        1
      from
        public.tasks t
      where
        t.object_id = objects.id
        and t.assignee_id = auth.uid ()
    )
  );

create policy objects_manager_write on public.objects for all to authenticated using (public.current_role () = 'manager')
with
  check (public.current_role () = 'manager');

create policy tasks_read on public.tasks for
select
  to authenticated using (
    public.current_role () = 'manager'
    or assignee_id = auth.uid ()
  );

create policy tasks_manager_insert on public.tasks for insert to authenticated
with
  check (
    public.current_role () = 'manager'
    and author_id = auth.uid ()
    and status = 'Новая'
  );

create policy tasks_update on public.tasks
for update
  to authenticated using (
    public.current_role () = 'manager'
    or assignee_id = auth.uid ()
  )
with
  check (
    public.current_role () = 'manager'
    or assignee_id = auth.uid ()
  );

create policy tasks_manager_delete on public.tasks for delete to authenticated using (public.current_role () = 'manager');

create policy history_read on public.task_history for
select
  to authenticated using (
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
  );

revoke insert,
update,
delete on public.task_history
from
  anon,
  authenticated;

grant
select
  on public.task_history to authenticated;

revoke all on function public.change_task_status (uuid, public.task_status, text)
from
  public,
  anon;

grant
execute on function public.change_task_status (uuid, public.task_status, text) to authenticated;

-- Disable public sign-up in Supabase Auth settings. Never put service_role keys in VITE_* variables.
