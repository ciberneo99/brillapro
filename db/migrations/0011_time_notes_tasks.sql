-- Phase 4c: employee time tracking, private notes, tasks.

-- ───────── time entries ─────────
create table public.time_entries (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null,
  job_id      uuid,
  clock_in    timestamptz not null,
  clock_out   timestamptz,
  notes       text check (char_length(notes) <= 500),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  check (clock_out is null or clock_out > clock_in),
  constraint time_employee_fkey foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) deferrable initially deferred,
  constraint time_job_fkey      foreign key (tenant_id, job_id) references public.jobs(tenant_id, id) deferrable initially deferred
);
-- an employee can only be clocked in once at a time
create unique index time_one_open on public.time_entries(tenant_id, employee_id) where clock_out is null;
create index time_range_idx on public.time_entries(tenant_id, clock_in);
create trigger time_updated before update on public.time_entries for each row execute function public.set_updated_at();

alter table public.time_entries enable row level security;
create policy time_select on public.time_entries for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff'])
         or exists (select 1 from public.employees e where e.tenant_id = time_entries.tenant_id and e.id = time_entries.employee_id and e.user_id = auth.uid()));
create policy time_insert on public.time_entries for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']) and created_by = auth.uid());
create policy time_update on public.time_entries for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager'])) with check (public.has_role(tenant_id, array['owner','admin','manager']));
create policy time_delete on public.time_entries for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']));
revoke all on public.time_entries from anon;
revoke update on public.time_entries from authenticated;
grant update (job_id, clock_in, clock_out, notes) on public.time_entries to authenticated;

-- The signed-in user's own employee record in a company.
create or replace function public.my_employee(p_tenant uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.employees where tenant_id = p_tenant and user_id = auth.uid() and is_active limit 1
$$;

-- Clock in (optionally on a job they are assigned to). Employees act only for themselves.
create or replace function public.clock_in(p_tenant uuid, p_job uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare emp uuid := public.my_employee(p_tenant); eid uuid;
begin
  if emp is null or not public.is_member(p_tenant) then raise exception 'no employee record' using errcode = '42501'; end if;
  if p_job is not null and not (
       exists (select 1 from public.job_assignments a where a.tenant_id = p_tenant and a.job_id = p_job and a.employee_id = emp)
     ) then raise exception 'job not assigned' using errcode = '42501'; end if;
  insert into public.time_entries (tenant_id, employee_id, job_id, clock_in, created_by)
  values (p_tenant, emp, p_job, now(), auth.uid()) returning id into eid;
  return eid;
end $$;

create or replace function public.clock_out(p_tenant uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare emp uuid := public.my_employee(p_tenant); n integer;
begin
  if emp is null then raise exception 'no employee record' using errcode = '42501'; end if;
  update public.time_entries set clock_out = greatest(now(), clock_in + interval '1 second')
   where tenant_id = p_tenant and employee_id = emp and clock_out is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not clocked in' using errcode = '22023'; end if;
end $$;

-- Manager-side manual entry: local date + times in the company's time zone.
create or replace function public.add_time_entry(p_employee uuid, p_job uuid, p_date date, p_start time, p_end time, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.employees; tz text; eid uuid;
begin
  select * into e from public.employees where id = p_employee;
  if not found or not public.has_role(e.tenant_id, array['owner','admin','manager']) then raise exception 'not found' using errcode = '42501'; end if;
  if p_end <= p_start then raise exception 'invalid times' using errcode = '22023'; end if;
  select timezone into tz from public.tenant_settings where tenant_id = e.tenant_id;
  insert into public.time_entries (tenant_id, employee_id, job_id, clock_in, clock_out, notes, created_by)
  values (e.tenant_id, p_employee, p_job, (p_date + p_start) at time zone coalesce(tz, 'UTC'), (p_date + p_end) at time zone coalesce(tz, 'UTC'),
          nullif(btrim(p_notes), ''), auth.uid())
  returning id into eid;
  return eid;
end $$;

-- ───────── private notes ─────────
create table public.user_notes (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null default '' check (char_length(title) <= 120),
  body       text not null default '' check (char_length(body) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index user_notes_idx on public.user_notes(tenant_id, user_id, updated_at desc);
create trigger user_notes_updated before update on public.user_notes for each row execute function public.set_updated_at();
alter table public.user_notes enable row level security;
-- Only the author, and only while still working in that company. Nobody else (not even the owner) reads them.
create policy notes_all on public.user_notes for all to authenticated
  using (user_id = auth.uid() and public.has_role(tenant_id, array['owner','admin','manager','office_staff','employee']))
  with check (user_id = auth.uid() and public.has_role(tenant_id, array['owner','admin','manager','office_staff','employee']));
revoke all on public.user_notes from anon;
revoke update on public.user_notes from authenticated;
grant update (title, body) on public.user_notes to authenticated;

-- ───────── tasks ─────────
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  notes        text check (char_length(notes) <= 2000),
  due_date     date,
  assigned_to  uuid references public.profiles(id) on delete set null,
  is_done      boolean not null default false,
  completed_at timestamptz,
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index tasks_idx on public.tasks(tenant_id, is_done, due_date);
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
alter table public.tasks enable row level security;

create or replace function public.is_active_member(p_tenant uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.tenant_id = p_tenant and m.user_id = p_user and m.status = 'active')
$$;

create policy tasks_select on public.tasks for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff'])
         or (public.has_role(tenant_id, array['employee']) and (assigned_to = auth.uid() or created_by = auth.uid())));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff','employee']) and created_by = auth.uid()
              and (assigned_to is null or public.is_active_member(tenant_id, assigned_to)) and not is_done);
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']) or created_by = auth.uid())
  with check ((public.has_role(tenant_id, array['owner','admin','manager','office_staff']) or created_by = auth.uid())
              and (assigned_to is null or public.is_active_member(tenant_id, assigned_to)));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']) or created_by = auth.uid());
revoke all on public.tasks from anon;
revoke update on public.tasks from authenticated;
grant update (title, notes, due_date, assigned_to) on public.tasks to authenticated;

-- Done / not done: the creator, staff, or the assignee.
create or replace function public.set_task_done(p_task uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found or not (
       public.has_role(t.tenant_id, array['owner','admin','manager','office_staff'])
       or (public.has_role(t.tenant_id, array['employee']) and (t.assigned_to = auth.uid() or t.created_by = auth.uid()))
     ) then raise exception 'not found' using errcode = '42501'; end if;
  update public.tasks set is_done = p_done, completed_at = case when p_done then now() end where id = p_task;
end $$;

revoke all on function public.my_employee(uuid), public.clock_in(uuid, uuid), public.clock_out(uuid),
  public.add_time_entry(uuid, uuid, date, time, time, text), public.is_active_member(uuid, uuid), public.set_task_done(uuid, boolean) from public, anon;
grant execute on function public.my_employee(uuid), public.clock_in(uuid, uuid), public.clock_out(uuid),
  public.add_time_entry(uuid, uuid, date, time, time, text), public.is_active_member(uuid, uuid), public.set_task_done(uuid, boolean) to authenticated;
