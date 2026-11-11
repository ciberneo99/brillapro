-- Bank statements: imported transactions, sorted into categories and subcategories the company can extend.

create table public.bank_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  parent_id  uuid,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  keywords   text not null default '' check (char_length(keywords) <= 500),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, parent_id) references public.bank_categories (tenant_id, id)
);
create unique index bank_categories_name_idx on public.bank_categories (tenant_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- Only two levels: a subcategory cannot itself have subcategories.
create or replace function public.bank_categories_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'category cannot be its own parent' using errcode = '23514'; end if;
    if exists (select 1 from public.bank_categories p where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'only two category levels' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.parent_id is not null and exists (select 1 from public.bank_categories c where c.parent_id = new.id) then
    raise exception 'category with subcategories cannot become a subcategory' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger bank_categories_check before insert or update on public.bank_categories
  for each row execute function public.bank_categories_check();

create table public.bank_transactions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tx_date       date not null,
  description   text not null check (char_length(btrim(description)) between 1 and 300),
  amount_cents  bigint not null check (amount_cents <> 0 and abs(amount_cents) < 100000000000),
  balance_cents bigint,
  category_id   uuid,
  source        text check (source is null or char_length(source) <= 200),
  dedupe_key    text not null check (char_length(dedupe_key) <= 100),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  unique (tenant_id, dedupe_key),
  foreign key (tenant_id, category_id) references public.bank_categories (tenant_id, id)
);
create index bank_transactions_date_idx on public.bank_transactions (tenant_id, tx_date desc);

alter table public.bank_categories enable row level security;
alter table public.bank_transactions enable row level security;
create policy bank_categories_all on public.bank_categories for all to authenticated
  using (public.has_role(tenant_id, array['owner','admin','accountant']))
  with check (public.has_role(tenant_id, array['owner','admin','accountant']));
create policy bank_transactions_all on public.bank_transactions for all to authenticated
  using (public.has_role(tenant_id, array['owner','admin','accountant']))
  with check (public.has_role(tenant_id, array['owner','admin','accountant']) and created_by = (select auth.uid()));
grant select, insert, update, delete on public.bank_categories, public.bank_transactions to authenticated;
revoke all on public.bank_categories, public.bank_transactions from anon;

-- Starter set of categories (the company adds its own later). Safe to call more than once.
create or replace function public.ensure_bank_categories(p_tenant uuid, p_locale text default 'en') returns void
language plpgsql security definer set search_path = '' as $$
declare
  es boolean := p_locale = 'es';
  grp record; kid text; pid uuid; n integer;
begin
  if not public.has_role(p_tenant, array['owner','admin','accountant']) then raise exception 'not allowed' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('bank_categories:' || p_tenant::text));
  if exists (select 1 from public.bank_categories where tenant_id = p_tenant) then return; end if;
  n := 0;
  for grp in select * from (values
    (1, case when es then 'Ingresos' else 'Income' end, array[
      case when es then 'Pago por Zelle|zelle' else 'Zelle payment|zelle' end,
      case when es then 'Transferencia Venmo|venmo' else 'Venmo transfer|venmo' end,
      case when es then 'Pago con cheque|check,cheque,deposit' else 'Check payment|check,deposit' end,
      case when es then 'Depósito en efectivo|cash deposit' else 'Cash deposit|cash deposit' end,
      case when es then 'Otros ingresos|' else 'Other income|' end]),
    (2, case when es then 'Gastos de operación' else 'Operating expenses' end, array[
      case when es then 'Insumos|supplies,walmart,home depot,costco,amazon' else 'Supplies|supplies,walmart,home depot,costco,amazon' end,
      case when es then 'Uniformes, calzado y otros|uniform,shoes' else 'Uniform/Shoes & Others|uniform,shoes' end,
      case when es then 'Casetas y peajes|toll,ezpass,sunpass' else 'Toll fees|toll,ezpass,sunpass' end,
      case when es then 'Combustible|shell,chevron,exxon,gas station,fuel' else 'Fuel|shell,chevron,exxon,gas station,fuel' end,
      case when es then 'Seguros|insurance' else 'Insurance|insurance' end,
      case when es then 'Software y suscripciones|subscription,software' else 'Software & subscriptions|subscription,software' end,
      case when es then 'Nómina y contratistas|payroll,gusto' else 'Payroll & contractors|payroll,gusto' end]),
    (3, case when es then 'Banco' else 'Bank' end, array[
      case when es then 'Comisiones bancarias|fee,service charge,overdraft' else 'Bank Charges & Fees|fee,service charge,overdraft' end,
      case when es then 'Transferencias entre cuentas|transfer to,transfer from' else 'Account transfers|transfer to,transfer from' end]),
    (4, case when es then 'Dueño' else 'Owner' end, array[
      case when es then 'Retiro del dueño|owner draw' else 'Owner''s draw|owner draw' end,
      case when es then 'Aportación del dueño|owner contribution' else 'Owner''s contribution|owner contribution' end])
  ) as g(ord, name, kids) loop
    insert into public.bank_categories (tenant_id, name, sort_order) values (p_tenant, grp.name, grp.ord * 100) returning id into pid;
    n := 0;
    foreach kid in array grp.kids loop
      n := n + 1;
      insert into public.bank_categories (tenant_id, parent_id, name, keywords, sort_order)
        values (p_tenant, pid, split_part(kid, '|', 1), split_part(kid, '|', 2), n * 10);
    end loop;
  end loop;
end $$;
revoke all on function public.ensure_bank_categories(uuid, text) from public, anon;
grant execute on function public.ensure_bank_categories(uuid, text) to authenticated;
