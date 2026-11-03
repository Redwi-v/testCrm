create or replace function public.current_role () returns public.app_role language sql stable security definer
set
  search_path = public as $$ select case when coalesce((auth.jwt()->'app_metadata'->>'password_change_required')::boolean,false) or password_change_required then null else role end from public.profiles where id=auth.uid() $$;

create or replace function public.object_company_id (p_object uuid) returns uuid language sql stable security definer
set
  search_path = public as $$ select company_id from public.objects where id=p_object and archived_at is null $$;

create or replace function public.user_can_access_object (p_object uuid, p_user uuid) returns boolean language sql stable security definer
set
  search_path = public as $$ select exists(select 1 from public.tasks where object_id=p_object and assignee_id=p_user and archived_at is null) $$;

create or replace function public.enforce_task_transition () returns trigger language plpgsql security definer
set
  search_path = public as $$ declare r public.app_role; begin
 if public.current_company_id() is null or public.object_company_id(old.object_id) is distinct from public.current_company_id() then raise exception 'Task is outside your company'; end if;
 if new.author_id is distinct from old.author_id or new.created_at is distinct from old.created_at or new.archived_at is distinct from old.archived_at then if public.current_role()<>'manager' then raise exception 'Only managers may archive tasks or edit audit fields'; end if; end if;
 if new.title is distinct from old.title or new.description is distinct from old.description or new.object_id is distinct from old.object_id or new.assignee_id is distinct from old.assignee_id then if public.current_role()<>'manager' then raise exception 'Only managers may edit task details'; end if; end if;
 if new.status is distinct from old.status then r:=public.current_role(); if (old.status='Новая' and new.status='В работе') or (old.status='На доработке' and new.status='В работе') or (old.status='В работе' and new.status='На проверке') then if r<>'executor' or old.assignee_id<>auth.uid() then raise exception 'Only the assigned executor may perform this transition'; end if; elsif old.status='На проверке' and new.status in ('Принята','На доработке') then if r<>'manager' then raise exception 'Only managers may review tasks'; end if; else raise exception 'Invalid status transition'; end if; if new.status='На доработке' and nullif(btrim(current_setting('app.review_comment',true)),'') is null then raise exception 'A comment is required'; end if; end if;
 if new.object_id is distinct from old.object_id and public.object_company_id(new.object_id) is distinct from public.current_company_id() then raise exception 'Cannot move task outside your company'; end if; return new; end $$;
