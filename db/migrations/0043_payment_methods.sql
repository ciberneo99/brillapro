-- Payment methods the company can edit (Settings > Payment methods). The stored value on payments / expenses stays a short text code;
-- the built-in codes keep their old meaning, new ones get a generated code. Methods are hidden, never deleted.

create table public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  code       text not null check (code ~ '^[a-z0-9_]{1,40}$'),
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);
create unique index payment_methods_name_idx on public.payment_methods(tenant_id, lower(name));

alter table public.payment_methods enable row level security;

create policy pm_select on public.payment_methods for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','office_staff','accountant']));
create policy pm_insert on public.payment_methods for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']));
create policy pm_update on public.payment_methods for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin'])) with check (public.has_role(tenant_id, array['owner','admin']));

revoke all on public.payment_methods from anon;
revoke update, delete on public.payment_methods from authenticated;
grant update (name, sort_order, is_active) on public.payment_methods to authenticated;

-- Any text code is allowed now (the app checks it against this table).
alter table public.payments drop constraint if exists payments_method_check;
alter table public.expenses drop constraint if exists expenses_payment_method_check;

create or replace function public.seed_payment_methods(p_tenant uuid, p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
declare es boolean := (p_locale = 'es');
begin
  insert into public.payment_methods (tenant_id, code, name, sort_order)
  select p_tenant, c, n, o from (values
    ('cash',          case when es then 'Efectivo' else 'Cash' end, 1),
    ('check',         case when es then 'Cheque' else 'Check' end, 2),
    ('card',          case when es then 'Tarjeta' else 'Card' end, 3),
    ('zelle',         'Zelle', 4),
    ('venmo',         'Venmo', 5),
    ('bank_transfer', case when es then 'Transferencia bancaria' else 'Bank transfer' end, 6),
    ('other',         case when es then 'Otro' else 'Other' end, 7)
  ) as v(c, n, o)
  on conflict do nothing;
end $$;
revoke all on function public.seed_payment_methods(uuid, text) from public, anon, authenticated;

do $$
declare t record;
begin
  for t in select s.tenant_id, s.doc_locale from public.tenant_settings s loop
    perform public.seed_payment_methods(t.tenant_id, t.doc_locale);
  end loop;
end $$;

-- New companies get them as soon as their settings row is created.
create or replace function public.seed_payment_methods_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.seed_payment_methods(new.tenant_id, new.doc_locale);
  return new;
end $$;
revoke all on function public.seed_payment_methods_trigger() from public, anon, authenticated;
create trigger tenant_settings_seed_payment_methods after insert on public.tenant_settings
  for each row execute function public.seed_payment_methods_trigger();
