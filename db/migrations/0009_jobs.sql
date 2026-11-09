-- Phase 4a: employees, jobs, assignments, per-job checklist snapshot, quote → job.
-- Staff roles (owner/admin/manager/office_staff) manage everything; employees see only jobs they are assigned to.

create table public.employees (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid references public.profiles(id) on delete set null,   -- optional login link
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone       text check (char_length(phone) <= 30),
  email       text check (char_length(email) <= 254),
  notes       text check (char_length(notes) <= 1000),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index employees_user_idx on public.employees(tenant_id, user_id) where user_id is not null;
create trigger employees_updated before update on public.employees for each row execute function public.set_updated_at();

create table public.jobs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  customer_id     uuid not null,
  quote_id        uuid,
  service_type_id uuid,
  title           text not null check (char_length(btrim(title)) between 1 and 120),
  status          text not null default 'scheduled' check (status in ('scheduled','in_progress','completed','cancelled')),
  scheduled_date  date not null,
  start_time      time,
  end_time        time,
  customer_name   text not null default '',     -- snapshots, so assigned employees need no access to customers
  address         text,
  access_notes    text check (char_length(access_notes) <= 1000),
  price_cents     integer not null default 0 check (price_cents >= 0),
  notes           text check (char_length(notes) <= 2000),
  completed_at    timestamptz,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, id),
  check (end_time is null or start_time is null or end_time > start_time),
  constraint jobs_customer_fkey foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) deferrable initially deferred,
  constraint jobs_quote_fkey    foreign key (tenant_id, quote_id) references public.quotes(tenant_id, id) deferrable initially deferred,
  constraint jobs_service_fkey  foreign key (tenant_id, service_type_id) references public.service_types(tenant_id, id) deferrable initially deferred
);
create unique index jobs_quote_once on public.jobs(tenant_id, quote_id) where quote_id is not null and status <> 'cancelled';
create index jobs_date_idx on public.jobs(tenant_id, scheduled_date, start_time);
create index jobs_customer_idx on public.jobs(tenant_id, customer_id);
create trigger jobs_updated before update on public.jobs for each row execute function public.set_updated_at();

create table public.job_assignments (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  job_id      uuid not null,
  employee_id uuid not null,
  created_at  timestamptz not null default now(),
  primary key (job_id, employee_id),
  constraint job_assignments_job_fkey foreign key (tenant_id, job_id) references public.jobs(tenant_id, id) on delete cascade deferrable initially deferred,
  constraint job_assignments_emp_fkey foreign key (tenant_id, employee_id) references public.employees(tenant_id, id) on delete cascade deferrable initially deferred
);
create index job_assignments_emp_idx on public.job_assignments(tenant_id, employee_id);

create table public.job_checklist_items (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  job_id       uuid not null,
  category     text not null default '',
  title        text not null check (char_length(btrim(title)) between 1 and 200),
  instructions text,
  position     integer not null default 0,
  is_done      boolean not null default false,
  done_at      timestamptz,
  done_by      uuid references public.profiles(id) on delete set null,
  unique (tenant_id, id),
  constraint job_items_job_fkey foreign key (tenant_id, job_id) references public.jobs(tenant_id, id) on delete cascade deferrable initially deferred
);
create index job_items_idx on public.job_checklist_items(tenant_id, job_id, position);

-- Is the signed-in user an employee assigned to this job?
create or replace function public.is_assigned(p_tenant uuid, p_job uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.job_assignments a
    join public.employees e on e.tenant_id = a.tenant_id and e.id = a.employee_id
    where a.tenant_id = p_tenant and a.job_id = p_job and e.user_id = auth.uid()
  ) and public.has_role(p_tenant, array['employee'])
$$;

-- ───────── RLS ─────────
alter table public.employees           enable row level security;
alter table public.jobs                enable row level security;
alter table public.job_assignments     enable row level security;
alter table public.job_checklist_items enable row level security;

create policy employees_select on public.employees for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff'])
         or (user_id = auth.uid() and public.is_member(tenant_id)));
create policy employees_insert on public.employees for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']));
create policy employees_update on public.employees for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager'])) with check (public.has_role(tenant_id, array['owner','admin','manager']));

create policy jobs_select on public.jobs for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']) or public.is_assigned(tenant_id, id));
create policy jobs_insert on public.jobs for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']) and created_by = auth.uid());
create policy jobs_update on public.jobs for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']))
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));

create policy assignments_select on public.job_assignments for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']) or public.is_assigned(tenant_id, job_id));
create policy assignments_insert on public.job_assignments for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy assignments_delete on public.job_assignments for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));

create policy job_items_select on public.job_checklist_items for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']) or public.is_assigned(tenant_id, job_id));
create policy job_items_insert on public.job_checklist_items for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy job_items_update on public.job_checklist_items for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']))
  with check (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));
create policy job_items_delete on public.job_checklist_items for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff']));

revoke all on public.employees, public.jobs, public.job_assignments, public.job_checklist_items from anon;
revoke update on public.employees, public.jobs, public.job_checklist_items from authenticated;
revoke delete on public.employees, public.jobs from authenticated;   -- employees are deactivated; jobs are cancelled
grant update (user_id, full_name, phone, email, notes, is_active) on public.employees to authenticated;
grant update (service_type_id, title, scheduled_date, start_time, end_time, customer_name, address, access_notes, price_cents, notes) on public.jobs to authenticated;
grant update (category, title, instructions, position) on public.job_checklist_items to authenticated;

-- ───────── operations ─────────
-- Copy the active checklist of the job's service type into the job (later template edits never touch past jobs).
create or replace function public.snapshot_job_checklist(p_job uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; tpl uuid; n integer;
begin
  select * into j from public.jobs where id = p_job;
  if not found or not public.has_role(j.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if exists (select 1 from public.job_checklist_items where job_id = p_job) then return 0; end if;
  select id into tpl from public.checklist_templates where tenant_id = j.tenant_id and service_type_id = j.service_type_id and is_active;
  if tpl is null then return 0; end if;
  insert into public.job_checklist_items (tenant_id, job_id, category, title, instructions, position)
    select tenant_id, p_job, category, title, instructions, position from public.checklist_template_items where template_id = tpl;
  get diagnostics n = row_count;
  return n;
end $$;

-- Accepted quote → job (once). Price = the accepted option's total; customer/address are snapshotted.
create or replace function public.create_job_from_quote(p_quote uuid, p_date date) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q public.quotes; c public.customers; jid uuid; price bigint;
begin
  select * into q from public.quotes where id = p_quote;
  if not found or not public.has_role(q.tenant_id, array['owner','admin','manager','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if q.status <> 'accepted' then raise exception 'quote not accepted' using errcode = '22023'; end if;
  if exists (select 1 from public.jobs where quote_id = p_quote and status <> 'cancelled') then
    raise exception 'job exists' using errcode = '23505';
  end if;
  select * into c from public.customers where id = q.customer_id;
  select t.total_cents into price from public.quote_totals(p_quote) t
    where t.option_id is not distinct from q.selected_option_id limit 1;
  insert into public.jobs (tenant_id, customer_id, quote_id, service_type_id, title, scheduled_date, customer_name, address, access_notes, price_cents, created_by)
  values (q.tenant_id, q.customer_id, p_quote, q.service_type_id,
          coalesce(nullif(q.title, ''), 'Cleaning'), p_date,
          coalesce(nullif(btrim(c.first_name || ' ' || c.last_name), ''), c.company_name),
          nullif(btrim(concat_ws(', ', c.service_address, c.city, concat_ws(' ', c.state, c.zip_code))), ''),
          c.access_instructions, coalesce(price, 0), auth.uid())
  returning id into jid;
  perform public.snapshot_job_checklist(jid);
  return jid;
end $$;

-- Status changes. Staff: any status. Assigned employee: only scheduled → in_progress → completed.
create or replace function public.set_job_status(p_job uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; staff boolean;
begin
  select * into j from public.jobs where id = p_job for update;
  if not found then raise exception 'not found' using errcode = '42501'; end if;
  staff := public.has_role(j.tenant_id, array['owner','admin','manager','office_staff']);
  if not staff and not public.is_assigned(j.tenant_id, p_job) then raise exception 'not found' using errcode = '42501'; end if;
  if p_status not in ('scheduled','in_progress','completed','cancelled') then raise exception 'invalid status' using errcode = '22023'; end if;
  if not staff and not ((j.status = 'scheduled' and p_status = 'in_progress') or (j.status = 'in_progress' and p_status = 'completed')) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.jobs set status = p_status, completed_at = case when p_status = 'completed' then now() else null end where id = p_job;
end $$;

-- Tick/untick a checklist item (staff, or an employee assigned to the job).
create or replace function public.set_job_item_done(p_item uuid, p_done boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.job_checklist_items;
begin
  select * into i from public.job_checklist_items where id = p_item;
  if not found or not (public.has_role(i.tenant_id, array['owner','admin','manager','office_staff']) or public.is_assigned(i.tenant_id, i.job_id)) then
    raise exception 'not found' using errcode = '42501';
  end if;
  update public.job_checklist_items
     set is_done = p_done, done_at = case when p_done then now() end, done_by = case when p_done then auth.uid() end
   where id = p_item;
end $$;

revoke all on function public.is_assigned(uuid, uuid), public.snapshot_job_checklist(uuid), public.create_job_from_quote(uuid, date),
  public.set_job_status(uuid, text), public.set_job_item_done(uuid, boolean) from public, anon;
grant execute on function public.is_assigned(uuid, uuid), public.snapshot_job_checklist(uuid), public.create_job_from_quote(uuid, date),
  public.set_job_status(uuid, text), public.set_job_item_done(uuid, boolean) to authenticated;
