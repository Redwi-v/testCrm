create or replace function public.enforce_task_transition () returns trigger language plpgsql security definer
set
  search_path = public as $$ declare r public.app_role; begin
 if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at or new.archived_at is distinct from old.archived_at then if public.current_role()<>'manager' then raise exception 'Only managers may archive tasks or edit audit fields'; end if; end if;
 if new.title is distinct from old.title or new.description is distinct from old.description or new.object_id is distinct from old.object_id or new.assignee_id is distinct from old.assignee_id then if public.current_role()<>'manager' then raise exception 'Only managers may edit task details'; end if; end if;
 if new.status is distinct from old.status then r:=public.current_role(); if (old.status='Новая' and new.status='В работе') or (old.status='На доработке' and new.status='В работе') or (old.status='В работе' and new.status='На проверке') then if r<>'executor' or old.assignee_id<>auth.uid() then raise exception 'Only the assigned executor may perform this transition'; end if; elsif old.status='На проверке' and new.status in ('Принята','На доработке') then if r<>'manager' then raise exception 'Only managers may review tasks'; end if; else raise exception 'Invalid status transition'; end if; if new.status='На доработке' and nullif(btrim(current_setting('app.review_comment',true)),'') is null then raise exception 'A comment is required'; end if; end if; return new; end $$;

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
      and exists (
        select
          1
        from
          public.profiles a
        where
          a.id = assignee_id
          and a.company_id = public.current_company_id ()
      )
      or public.current_role () = 'executor'
      and assignee_id = auth.uid ()
    )
  );
