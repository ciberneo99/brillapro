-- Templates and their items are tenant-owned: they must belong to a company and disappear with it.
-- (0004 only linked them through composite keys, so deleting a company left them orphaned.)
alter table public.checklist_templates
  add constraint checklist_templates_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;
alter table public.checklist_template_items
  add constraint checklist_template_items_tenant_fkey foreign key (tenant_id) references public.tenants(id) on delete cascade;
