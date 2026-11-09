-- Deleting a company cascades through several tenant-owned tables at once. A plain composite FK between two of
-- them is checked while the cascade is mid-way and blocks it. Deferring the check to commit keeps the protection
-- (a service type in use cannot be removed on its own) and lets a whole company be deleted cleanly.
-- Convention for all future tenant-owned cross references: DEFERRABLE INITIALLY DEFERRED.
alter table public.checklist_templates
  drop constraint checklist_templates_tenant_id_service_type_id_fkey,
  add constraint checklist_templates_service_type_fkey
    foreign key (tenant_id, service_type_id) references public.service_types(tenant_id, id)
    deferrable initially deferred;
