-- Phase 5a: invoices, lines, payments (recorded from the invoice), totals in SQL.
-- Money in integer cents. No separate Payments module: payments belong to an invoice.

alter table public.tenant_settings
  add column invoice_prefix   text    not null default 'INV-' check (char_length(invoice_prefix) <= 10),
  add column invoice_due_days integer not null default 15 check (invoice_due_days between 0 and 365),
  add column invoice_terms    text check (char_length(invoice_terms) <= 3000);
alter table public.tenant_counters add column invoice_seq integer not null default 0;

create table public.invoices (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  customer_id      uuid not null,
  job_id           uuid,
  quote_id         uuid,
  number           integer not null,
  status           text not null default 'draft' check (status in ('draft','sent','void')),
  issue_date       date not null default current_date,
  due_date         date not null,
  customer_name    text not null default '',        -- snapshots: the document never changes if the customer is edited later
  customer_email   text,
  billing_address  text,
  discount_cents   integer not null default 0 check (discount_cents >= 0),
  tax_rate         numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  notes            text check (char_length(notes) <= 2000),
  terms            text check (char_length(terms) <= 3000),
  sent_at          timestamptz,
  voided_at        timestamptz,
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, number),
  check (due_date >= issue_date),
  constraint invoices_customer_fkey foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) deferrable initially deferred,
  constraint invoices_job_fkey      foreign key (tenant_id, job_id)      references public.jobs(tenant_id, id) deferrable initially deferred,
  constraint invoices_quote_fkey    foreign key (tenant_id, quote_id)    references public.quotes(tenant_id, id) deferrable initially deferred
);
create unique index invoices_job_once on public.invoices(tenant_id, job_id) where job_id is not null and status <> 'void';
create index invoices_customer_idx on public.invoices(tenant_id, customer_id);
create index invoices_status_idx   on public.invoices(tenant_id, status, due_date);
create trigger invoices_updated before update on public.invoices for each row execute function public.set_updated_at();

create table public.invoice_lines (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  invoice_id       uuid not null,
  description      text not null check (char_length(btrim(description)) between 1 and 200),
  quantity         numeric(10,2) not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  position         integer not null default 0,
  unique (tenant_id, id),
  constraint invoice_lines_invoice_fkey foreign key (tenant_id, invoice_id) references public.invoices(tenant_id, id) on delete cascade deferrable initially deferred
);
create index invoice_lines_idx on public.invoice_lines(tenant_id, invoice_id, position);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  invoice_id   uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_on      date not null,
  method       text not null check (method in ('cash','check','card','zelle','venmo','bank_transfer','other')),
  reference    text check (char_length(reference) <= 120),
  notes        text check (char_length(notes) <= 500),
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (tenant_id, id),
  constraint payments_invoice_fkey foreign key (tenant_id, invoice_id) references public.invoices(tenant_id, id) deferrable initially deferred
);
create index payments_invoice_idx on public.payments(tenant_id, invoice_id);
create index payments_date_idx on public.payments(tenant_id, paid_on);

create or replace function public.assign_invoice_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tenant_counters (tenant_id, invoice_seq) values (new.tenant_id, 1)
  on conflict (tenant_id) do update set invoice_seq = public.tenant_counters.invoice_seq + 1
  returning invoice_seq into new.number;
  return new;
end $$;
create trigger invoices_number before insert on public.invoices for each row execute function public.assign_invoice_number();

-- ───────── RLS ─────────
alter table public.invoices      enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.payments      enable row level security;

create policy invoices_select on public.invoices for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','office_staff','accountant']));
create policy invoices_insert on public.invoices for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','office_staff']) and status = 'draft' and created_by = auth.uid());
create policy invoices_update on public.invoices for update to authenticated
  using (status = 'draft' and public.has_role(tenant_id, array['owner','admin','office_staff']))
  with check (status = 'draft' and public.has_role(tenant_id, array['owner','admin','office_staff']));
create policy invoices_delete on public.invoices for delete to authenticated
  using (status = 'draft' and public.has_role(tenant_id, array['owner','admin','office_staff']));

create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','office_staff','accountant']));
create policy invoice_lines_write on public.invoice_lines for all to authenticated
  using (public.has_role(tenant_id, array['owner','admin','office_staff'])
         and exists (select 1 from public.invoices i where i.tenant_id = invoice_lines.tenant_id and i.id = invoice_lines.invoice_id and i.status = 'draft'))
  with check (public.has_role(tenant_id, array['owner','admin','office_staff'])
         and exists (select 1 from public.invoices i where i.tenant_id = invoice_lines.tenant_id and i.id = invoice_lines.invoice_id and i.status = 'draft'));

-- Payments are created only through record_payment() (checks the balance); owners/admins can remove a mistaken one.
create policy payments_select on public.payments for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','office_staff','accountant']));
create policy payments_delete on public.payments for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin']));

revoke all on public.invoices, public.invoice_lines, public.payments from anon;
revoke update on public.invoices, public.invoice_lines from authenticated;
revoke insert, update on public.payments from authenticated;
grant update (issue_date, due_date, customer_name, customer_email, billing_address, discount_cents, tax_rate, notes, terms) on public.invoices to authenticated;
grant update (description, quantity, unit_price_cents, position) on public.invoice_lines to authenticated;

-- ───────── totals ─────────
create or replace function public.invoice_totals(p_invoice uuid)
returns table (subtotal_cents bigint, discount_cents bigint, tax_cents bigint, total_cents bigint, paid_cents bigint, balance_cents bigint)
language sql stable security invoker set search_path = '' as $$
  with i as (select * from public.invoices where id = p_invoice),
  l as (select coalesce(sum(round(quantity * unit_price_cents)), 0)::bigint as sub from public.invoice_lines where invoice_id = p_invoice),
  p as (select coalesce(sum(amount_cents), 0)::bigint as paid from public.payments where invoice_id = p_invoice),
  c as (select l.sub, least(i.discount_cents, l.sub)::bigint as disc, i.tax_rate as r, p.paid from i, l, p)
  select sub, disc, round((sub - disc) * r / 100)::bigint,
         (sub - disc) + round((sub - disc) * r / 100)::bigint,
         paid,
         (sub - disc) + round((sub - disc) * r / 100)::bigint - paid
  from c
$$;

-- Display status: void | draft | paid | partial | overdue | sent
create or replace view public.invoices_overview with (security_invoker = true) as
select i.id, i.tenant_id, i.customer_id, i.job_id, i.number, i.status, i.issue_date, i.due_date, i.customer_name, i.created_at,
       t.total_cents, t.paid_cents, t.balance_cents,
       case
         when i.status in ('void','draft') then i.status
         when t.total_cents > 0 and t.balance_cents <= 0 then 'paid'
         when t.paid_cents > 0 and i.due_date >= current_date then 'partial'
         when t.balance_cents > 0 and i.due_date < current_date then 'overdue'
         when t.paid_cents > 0 then 'partial'
         else 'sent'
       end as display_status
from public.invoices i
left join lateral public.invoice_totals(i.id) t on true;
grant select on public.invoices_overview to authenticated;
revoke all on public.invoices_overview from anon;

-- ───────── operations ─────────
-- Invoice from a job: copies the quote (option + extras, discount, tax) when the job came from one, otherwise one line at the job price.
create or replace function public.create_invoice_from_job(p_job uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare j public.jobs; c public.customers; q public.quotes; s public.tenant_settings; iid uuid; n integer := 0; opt public.quote_options;
begin
  select * into j from public.jobs where id = p_job;
  if not found or not public.has_role(j.tenant_id, array['owner','admin','office_staff']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  if j.status = 'cancelled' then raise exception 'job cancelled' using errcode = '22023'; end if;
  if exists (select 1 from public.invoices where job_id = p_job and status <> 'void') then
    raise exception 'invoice exists' using errcode = '23505';
  end if;
  select * into c from public.customers where id = j.customer_id;
  select * into s from public.tenant_settings where tenant_id = j.tenant_id;
  if j.quote_id is not null then select * into q from public.quotes where id = j.quote_id; end if;

  insert into public.invoices (tenant_id, customer_id, job_id, quote_id, issue_date, due_date, customer_name, customer_email, billing_address,
                               discount_cents, tax_rate, terms, created_by)
  values (j.tenant_id, j.customer_id, p_job, j.quote_id, current_date, current_date + s.invoice_due_days, j.customer_name, c.email,
          nullif(btrim(concat_ws(', ', coalesce(c.billing_address, c.service_address), c.city, concat_ws(' ', c.state, c.zip_code))), ''),
          coalesce(q.discount_cents, 0), coalesce(q.tax_rate, s.default_tax_rate), coalesce(s.invoice_terms, q.terms), auth.uid())
  returning id into iid;

  if q.id is not null then
    select * into opt from public.quote_options where id = q.selected_option_id;
    if found then
      n := n + 1;
      insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents, position)
      values (j.tenant_id, iid, concat_ws(' - ', j.title, opt.name), 1, opt.base_price_cents, n);
    end if;
    insert into public.invoice_lines (tenant_id, invoice_id, description, quantity, unit_price_cents, position)
      select j.tenant_id, iid, description, quantity, unit_price_cents, n + position from public.quote_lines where quote_id = q.id order by position;
    if not exists (select 1 from public.invoice_lines where invoice_id = iid) then
      insert into public.invoice_lines (tenant_id, invoice_id, description, unit_price_cents, position) values (j.tenant_id, iid, j.title, j.price_cents, 1);
    end if;
  else
    insert into public.invoice_lines (tenant_id, invoice_id, description, unit_price_cents, position) values (j.tenant_id, iid, j.title, j.price_cents, 1);
  end if;
  return iid;
end $$;

-- draft → sent (issued). Needs at least one line.
create or replace function public.issue_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = p_id for update;
  if not found or not public.has_role(i.tenant_id, array['owner','admin','office_staff']) then raise exception 'not found' using errcode = '42501'; end if;
  if i.status <> 'draft' then raise exception 'invalid transition' using errcode = '22023'; end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_id) then raise exception 'no lines' using errcode = '22023'; end if;
  update public.invoices set status = 'sent', sent_at = now() where id = p_id;
end $$;

-- sent → void, only while nothing has been paid.
create or replace function public.void_invoice(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare i public.invoices;
begin
  select * into i from public.invoices where id = p_id for update;
  if not found or not public.has_role(i.tenant_id, array['owner','admin','office_staff']) then raise exception 'not found' using errcode = '42501'; end if;
  if i.status <> 'sent' then raise exception 'invalid transition' using errcode = '22023'; end if;
  if exists (select 1 from public.payments where invoice_id = p_id) then raise exception 'has payments' using errcode = '22023'; end if;
  update public.invoices set status = 'void', voided_at = now() where id = p_id;
end $$;

-- Record a payment; cannot exceed the balance, only on issued invoices.
create or replace function public.record_payment(p_invoice uuid, p_amount integer, p_date date, p_method text, p_reference text, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.invoices; bal bigint; pid uuid;
begin
  select * into i from public.invoices where id = p_invoice for update;
  if not found or not public.has_role(i.tenant_id, array['owner','admin','office_staff']) then raise exception 'not found' using errcode = '42501'; end if;
  if i.status <> 'sent' then raise exception 'invoice not open' using errcode = '22023'; end if;
  select t.balance_cents into bal from public.invoice_totals(p_invoice) t;
  if p_amount <= 0 or p_amount > bal then raise exception 'amount exceeds balance' using errcode = '22023'; end if;
  insert into public.payments (tenant_id, invoice_id, amount_cents, paid_on, method, reference, notes, created_by)
  values (i.tenant_id, p_invoice, p_amount, p_date, p_method, nullif(btrim(p_reference), ''), nullif(btrim(p_notes), ''), auth.uid())
  returning id into pid;
  return pid;
end $$;

revoke all on function public.create_invoice_from_job(uuid), public.issue_invoice(uuid), public.void_invoice(uuid),
  public.record_payment(uuid, integer, date, text, text, text) from public, anon;
grant execute on function public.create_invoice_from_job(uuid), public.issue_invoice(uuid), public.void_invoice(uuid),
  public.record_payment(uuid, integer, date, text, text, text) to authenticated;
