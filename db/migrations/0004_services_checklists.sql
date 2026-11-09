-- BrillaPro · Migration 0004 · Service types & cleaning checklist templates (Phase 3a)
-- Each company gets its own catalog of service types (seeded) and editable checklist templates.
-- Templates are configuration: jobs (Phase 4) will store an independent SNAPSHOT of the checklist they use.

begin;

-- ───────── service types ─────────
create table public.service_types (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  code        text check (code in ('standard','deep','move_in','move_out','recurring','office','custom')),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index service_types_name_idx on public.service_types(tenant_id, lower(name));
create trigger service_types_updated before update on public.service_types for each row execute function public.set_updated_at();

-- ───────── checklist templates ─────────
create table public.checklist_templates (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  service_type_id  uuid not null,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  instructions     text check (char_length(instructions) <= 2000),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, service_type_id) references public.service_types(tenant_id, id)
);
-- at most ONE active template per service type: "select a service → its template loads"
create unique index checklist_templates_one_active on public.checklist_templates(tenant_id, service_type_id) where is_active;
create trigger checklist_templates_updated before update on public.checklist_templates for each row execute function public.set_updated_at();

create table public.checklist_template_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  template_id   uuid not null,
  category      text not null default '' check (char_length(category) <= 80),
  title         text not null check (char_length(btrim(title)) between 1 and 200),
  instructions  text check (char_length(instructions) <= 1000),
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, template_id) references public.checklist_templates(tenant_id, id) on delete cascade
);
create index checklist_items_idx on public.checklist_template_items(tenant_id, template_id, position);

-- ───────── RLS ─────────
alter table public.service_types              enable row level security;
alter table public.checklist_templates        enable row level security;
alter table public.checklist_template_items   enable row level security;

-- Read: everyone who works jobs (not accountants). Write: service types owner/admin; templates owner/admin/manager.
create policy service_types_select on public.service_types for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff','employee']));
create policy service_types_insert on public.service_types for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']));
create policy service_types_update on public.service_types for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin'])) with check (public.has_role(tenant_id, array['owner','admin']));

create policy templates_select on public.checklist_templates for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff','employee']));
create policy templates_insert on public.checklist_templates for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']));
create policy templates_update on public.checklist_templates for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager'])) with check (public.has_role(tenant_id, array['owner','admin','manager']));

create policy template_items_select on public.checklist_template_items for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager','office_staff','employee']));
create policy template_items_insert on public.checklist_template_items for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin','manager']));
create policy template_items_update on public.checklist_template_items for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager'])) with check (public.has_role(tenant_id, array['owner','admin','manager']));
create policy template_items_delete on public.checklist_template_items for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin','manager']));
-- No delete on service types or templates: they are deactivated (jobs and quotes will reference them).

revoke all on public.service_types, public.checklist_templates, public.checklist_template_items from anon;
revoke delete on public.service_types, public.checklist_templates from authenticated;
revoke update on public.service_types, public.checklist_templates, public.checklist_template_items from authenticated;
grant update (name, sort_order, is_active) on public.service_types to authenticated;
grant update (service_type_id, name, instructions, is_active) on public.checklist_templates to authenticated;
grant update (category, title, instructions, position) on public.checklist_template_items to authenticated;

-- ───────── starter content (editable) ─────────
create or replace function public.seed_tenant_services(p_tenant uuid, p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  es boolean := (p_locale = 'es');
  std uuid; deep uuid; tpl uuid;
begin
  insert into public.service_types (tenant_id, code, name, sort_order) values
    (p_tenant, 'standard',  case when es then 'Limpieza estándar'     else 'Standard Cleaning' end, 1),
    (p_tenant, 'deep',      case when es then 'Limpieza profunda'     else 'Deep Cleaning' end, 2),
    (p_tenant, 'move_in',   case when es then 'Limpieza de mudanza (entrada)' else 'Move-In Cleaning' end, 3),
    (p_tenant, 'move_out',  case when es then 'Limpieza de mudanza (salida)'  else 'Move-Out Cleaning' end, 4),
    (p_tenant, 'recurring', case when es then 'Limpieza recurrente'   else 'Recurring Cleaning' end, 5),
    (p_tenant, 'office',    case when es then 'Limpieza de oficina'   else 'Office Cleaning' end, 6),
    (p_tenant, 'custom',    case when es then 'Limpieza personalizada' else 'Custom Cleaning' end, 7);

  select id into std  from public.service_types where tenant_id = p_tenant and code = 'standard';
  select id into deep from public.service_types where tenant_id = p_tenant and code = 'deep';

  insert into public.checklist_templates (tenant_id, service_type_id, name)
  values (p_tenant, std, case when es then 'Limpieza estándar' else 'Standard Cleaning' end) returning id into tpl;
  insert into public.checklist_template_items (tenant_id, template_id, category, title, position)
  select p_tenant, tpl, c, t, row_number() over ()
  from (values
    (case when es then 'Cocina' else 'Kitchen' end,     case when es then 'Limpiar encimeras y fregadero' else 'Wipe counters and sink' end),
    (case when es then 'Cocina' else 'Kitchen' end,     case when es then 'Limpiar el exterior de electrodomésticos' else 'Clean appliance exteriors' end),
    (case when es then 'Cocina' else 'Kitchen' end,     case when es then 'Barrer y trapear el piso' else 'Sweep and mop floor' end),
    (case when es then 'Baños' else 'Bathrooms' end,    case when es then 'Limpiar y desinfectar inodoro' else 'Clean and disinfect toilet' end),
    (case when es then 'Baños' else 'Bathrooms' end,    case when es then 'Limpiar lavabo, espejo y regadera o tina' else 'Clean sink, mirror and shower or tub' end),
    (case when es then 'Baños' else 'Bathrooms' end,    case when es then 'Barrer y trapear el piso' else 'Sweep and mop floor' end),
    (case when es then 'Recámaras' else 'Bedrooms' end, case when es then 'Quitar el polvo de superficies' else 'Dust surfaces' end),
    (case when es then 'Recámaras' else 'Bedrooms' end, case when es then 'Aspirar pisos' else 'Vacuum floors' end),
    (case when es then 'Áreas comunes' else 'Living areas' end, case when es then 'Quitar el polvo de muebles y decoración' else 'Dust furniture and decor' end),
    (case when es then 'Áreas comunes' else 'Living areas' end, case when es then 'Aspirar alfombras y pisos' else 'Vacuum carpets and floors' end),
    (case when es then 'Áreas comunes' else 'Living areas' end, case when es then 'Vaciar botes de basura' else 'Empty trash bins' end)
  ) as v(c, t);

  insert into public.checklist_templates (tenant_id, service_type_id, name)
  values (p_tenant, deep, case when es then 'Limpieza profunda' else 'Deep Cleaning' end) returning id into tpl;
  insert into public.checklist_template_items (tenant_id, template_id, category, title, position)
  select p_tenant, tpl, c, t, row_number() over ()
  from (values
    (case when es then 'Cocina' else 'Kitchen' end,     case when es then 'Limpiar por dentro horno y microondas' else 'Clean inside oven and microwave' end),
    (case when es then 'Cocina' else 'Kitchen' end,     case when es then 'Limpiar por dentro el refrigerador' else 'Clean inside refrigerator' end),
    (case when es then 'Cocina' else 'Kitchen' end,     case when es then 'Limpiar gabinetes por fuera y por dentro' else 'Clean cabinets inside and out' end),
    (case when es then 'Baños' else 'Bathrooms' end,    case when es then 'Descalcificar regadera, grifos y azulejos' else 'Descale shower, fixtures and tile' end),
    (case when es then 'Baños' else 'Bathrooms' end,    case when es then 'Limpiar rejillas de ventilación' else 'Clean vent covers' end),
    (case when es then 'General' else 'Whole home' end, case when es then 'Limpiar zoclos y marcos de puertas' else 'Clean baseboards and door frames' end),
    (case when es then 'General' else 'Whole home' end, case when es then 'Limpiar ventanas por dentro y repisas' else 'Clean interior windows and sills' end),
    (case when es then 'General' else 'Whole home' end, case when es then 'Quitar telarañas y polvo de techos y ventiladores' else 'Remove cobwebs and dust ceilings and fans' end)
  ) as v(c, t);
end $$;
revoke all on function public.seed_tenant_services(uuid, text) from public, anon, authenticated;

-- New companies get the catalog at creation; existing ones are backfilled below.
create or replace function public.create_tenant(p_name text, p_locale text default 'en') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  uemail text;
  uname text;
  tid uuid;
  loc text := case when p_locale in ('en','es') then p_locale else 'en' end;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_name is null or char_length(btrim(p_name)) < 2 then
    raise exception 'invalid company name' using errcode = '22023';
  end if;

  select email, coalesce(raw_user_meta_data->>'full_name', '') into uemail, uname
  from auth.users where id = uid;

  insert into public.profiles (id, email, full_name, locale)
  values (uid, coalesce(uemail, ''), coalesce(uname, ''), loc)
  on conflict (id) do nothing;

  insert into public.tenants (name) values (btrim(p_name)) returning id into tid;
  insert into public.memberships (tenant_id, user_id, role) values (tid, uid, 'owner');
  insert into public.tenant_settings (tenant_id, doc_locale) values (tid, loc);
  insert into public.subscriptions (tenant_id, plan_id, status, trial_ends_at)
  values (tid, 'trial', 'trialing', now() + interval '14 days');
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id)
  values (tid, uid, 'tenant.created', 'tenant', tid::text);
  perform public.seed_tenant_services(tid, loc);

  return tid;
end $$;

do $$
declare r record;
begin
  for r in
    select t.id, coalesce((select p.locale from public.memberships m join public.profiles p on p.id = m.user_id
                           where m.tenant_id = t.id and m.role = 'owner' order by m.created_at limit 1), 'en') as loc
    from public.tenants t
    where not exists (select 1 from public.service_types s where s.tenant_id = t.id)
  loop
    perform public.seed_tenant_services(r.id, r.loc);
  end loop;
end $$;

commit;
