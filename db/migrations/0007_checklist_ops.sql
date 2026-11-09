-- Atomic checklist operations (permission-checked inside, so they stay safe when called from the app).

-- Make one template the active one for its service type (others of that service become inactive), atomically.
create or replace function public.activate_checklist_template(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.checklist_templates;
begin
  select * into t from public.checklist_templates where id = p_id;
  if not found or not public.has_role(t.tenant_id, array['owner','admin','manager']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  update public.checklist_templates set is_active = false
   where tenant_id = t.tenant_id and service_type_id = t.service_type_id and id <> t.id and is_active;
  update public.checklist_templates set is_active = true where id = t.id;
end $$;

-- Re-number the items of a template to match the given order (ids not in the template are rejected).
create or replace function public.reorder_template_items(p_template uuid, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.checklist_templates; n integer;
begin
  select * into t from public.checklist_templates where id = p_template;
  if not found or not public.has_role(t.tenant_id, array['owner','admin','manager']) then
    raise exception 'not found' using errcode = '42501';
  end if;
  select count(*) into n from public.checklist_template_items where template_id = p_template and tenant_id = t.tenant_id and id = any(p_ids);
  if n <> coalesce(array_length(p_ids, 1), 0) then
    raise exception 'invalid items' using errcode = '22023';
  end if;
  update public.checklist_template_items i
     set position = o.ord
    from unnest(p_ids) with ordinality as o(item_id, ord)
   where i.id = o.item_id and i.template_id = p_template and i.tenant_id = t.tenant_id;
end $$;

revoke all on function public.activate_checklist_template(uuid), public.reorder_template_items(uuid, uuid[]) from public, anon;
grant execute on function public.activate_checklist_template(uuid), public.reorder_template_items(uuid, uuid[]) to authenticated;
