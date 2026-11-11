-- The accountant role is read-only everywhere. Bank statements: owner and admin read and write, the accountant only reads.

drop policy bank_categories_all on public.bank_categories;
create policy bank_categories_select on public.bank_categories for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','accountant']));
create policy bank_categories_insert on public.bank_categories for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']));
create policy bank_categories_update on public.bank_categories for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin'])) with check (public.has_role(tenant_id, array['owner','admin']));
create policy bank_categories_delete on public.bank_categories for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin']));

drop policy bank_transactions_all on public.bank_transactions;
create policy bank_transactions_select on public.bank_transactions for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin','accountant']));
create policy bank_transactions_insert on public.bank_transactions for insert to authenticated
  with check (public.has_role(tenant_id, array['owner','admin']) and created_by = (select auth.uid()));
create policy bank_transactions_update on public.bank_transactions for update to authenticated
  using (public.has_role(tenant_id, array['owner','admin'])) with check (public.has_role(tenant_id, array['owner','admin']));
create policy bank_transactions_delete on public.bank_transactions for delete to authenticated
  using (public.has_role(tenant_id, array['owner','admin']));

-- Seeding inserts rows, so it follows the write roles.
create or replace function public.ensure_bank_categories(p_tenant uuid, p_locale text default 'en') returns void
language plpgsql security definer set search_path = '' as $$
declare
  es boolean := p_locale = 'es';
  grp record; kid text; pid uuid; n integer;
begin
  if not public.has_role(p_tenant, array['owner','admin']) then raise exception 'not allowed' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('bank_categories:' || p_tenant::text));
  if exists (select 1 from public.bank_categories where tenant_id = p_tenant) then return; end if;
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
