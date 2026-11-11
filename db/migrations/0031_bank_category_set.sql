-- The company's own category list becomes the starter set (replacing the generic one from 0029).
-- Format of each line: 'Main category|Subcategory|keywords' ; a line with an empty subcategory is the main category itself.

create or replace function public.bank_add_default_categories(p_tenant uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  lines text[] := array[
    'Advertising & Marketing||advertising,marketing', 'Advertising & Marketing|Google ads|google ads', 'Advertising & Marketing|Leads|leads',
    'Bank Charges & Fees||fee,service charge,overdraft',
    'Commissions & Fees||commission',
    'Contract Labor / Subcontractors||contractor,subcontract,payroll',
    'Vehicle Expenses||', 'Vehicle Expenses|Gas/Fuel|shell,chevron,exxon,gas station,fuel', 'Vehicle Expenses|Mileage|mileage', 'Vehicle Expenses|Oil change|oil change',
    'Vehicle Expenses|Parking fee|parking', 'Vehicle Expenses|Repairs & Maintenance|repair', 'Vehicle Expenses|Vehicle insurance|auto insurance,geico,progressive,state farm',
    'Vehicle Expenses|Vehicle registration|dmv,registration', 'Vehicle Expenses|Toll fees|toll,ezpass,sunpass', 'Vehicle Expenses|Tires/Rims|tire', 'Vehicle Expenses|Windshield|windshield', 'Vehicle Expenses|Others|',
    'Meals & Entertainment||', 'Meals & Entertainment|Movies|cinema,amc', 'Meals & Entertainment|Work meals|', 'Meals & Entertainment|Restaurants-Client or staff|restaurant', 'Meals & Entertainment|Drinks/Snacks|snack,starbucks',
    'Office Expenses||', 'Office Expenses|Office supplies|staples,office depot', 'Office Expenses|Printer and Ink|ink', 'Office Expenses|Computers and tablets|', 'Office Expenses|Shipping and Couriers|ups,fedex,usps',
    'Office Expenses|Hardware|', 'Office Expenses|Internet|internet,comcast,spectrum', 'Office Expenses|Cell phones|', 'Office Expenses|Cell phone repair|', 'Office Expenses|Cell phone articles|',
    'Office Expenses|Cell phone plan|t-mobile,verizon', 'Office Expenses|Cell phone fees|', 'Office Expenses|Software & Subscriptions|subscription,software,adobe', 'Office Expenses|Licenses & Permits|license,permit',
    'Legal & Professional Services||', 'Legal & Professional Services|Accounting|accounting', 'Legal & Professional Services|Tax preparation|tax', 'Legal & Professional Services|Legal fees|legal', 'Legal & Professional Services|Attorney|attorney',
    'Rent or Lease||rent,lease', 'Rent or Lease|Equipment|', 'Rent or Lease|Proyector|', 'Rent or Lease|Screen|', 'Rent or Lease|Carpet cleaner machine|', 'Rent or Lease|Window cleaning tool|',
    'Rent or Lease|Washer pressure machine|', 'Rent or Lease|Machinery|', 'Rent or Lease|Office space|', 'Rent or Lease|Vehicles|',
    'Supplies||supplies', 'Supplies|Cleaning Supplies|walmart,home depot,costco', 'Supplies|Cleaning tools|', 'Supplies|Cleaning products|', 'Supplies|Cleaning Equipment|',
    'Training & Education||', 'Training & Education|Online tutorial|tutorial,udemy', 'Training & Education|Ai course|', 'Training & Education|Design course|', 'Training & Education|Software|',
    'Personal||', 'Personal|Owner''s draw|owner draw', 'Personal|Uniform, Shoes & Others|uniform,shoes',
    'Income||', 'Income|Sales|', 'Income|Cleaning services|', 'Income|Zelle payment|zelle', 'Income|Venmo payment|venmo', 'Income|Check payment|check,deposit', 'Income|Cash payment|cash deposit',
    'Income|Paypal payment|paypal', 'Income|Other payment|', 'Income|Interest|interest', 'Income|Refunds|refund', 'Income|Venmo transfer|venmo transfer', 'Income|Paypal transfer|paypal transfer',
    'Income|Previous balance|', 'Income|Bank transfer|transfer to,transfer from'
  ];
  l text; parts text[]; pid uuid; n integer := 0;
begin
  foreach l in array lines loop
    n := n + 1;
    parts := string_to_array(l, '|');
    select id into pid from public.bank_categories where tenant_id = p_tenant and parent_id is null and lower(name) = lower(parts[1]);
    if parts[2] = '' then
      if pid is null then
        insert into public.bank_categories (tenant_id, name, keywords, sort_order) values (p_tenant, parts[1], parts[3], n * 10);
      end if;
    else
      if pid is null then
        insert into public.bank_categories (tenant_id, name, sort_order) values (p_tenant, parts[1], n * 10) returning id into pid;
      end if;
      if not exists (select 1 from public.bank_categories where tenant_id = p_tenant and parent_id = pid and lower(name) = lower(parts[2])) then
        insert into public.bank_categories (tenant_id, parent_id, name, keywords, sort_order) values (p_tenant, pid, parts[2], parts[3], n * 10);
      end if;
    end if;
  end loop;
end $$;
revoke all on function public.bank_add_default_categories(uuid) from public, anon, authenticated;

create or replace function public.ensure_bank_categories(p_tenant uuid, p_locale text default 'en') returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(p_tenant, array['owner','admin']) then raise exception 'not allowed' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtext('bank_categories:' || p_tenant::text));
  if exists (select 1 from public.bank_categories where tenant_id = p_tenant) then return; end if;
  perform public.bank_add_default_categories(p_tenant);
end $$;

-- Companies that only have the generic starter set from 0029: add the new list and hide (not delete) the old groups.
do $$
declare t uuid;
begin
  for t in
    select p.tenant_id from public.bank_categories p
    where p.parent_id is null and p.name in ('Operating expenses', 'Gastos de operación')
      and not exists (select 1 from public.bank_categories c where c.tenant_id = p.tenant_id and c.name = 'Vehicle Expenses')
  loop
    perform public.bank_add_default_categories(t);
    update public.bank_categories set is_active = false
      where tenant_id = t and (
        name in ('Operating expenses', 'Gastos de operación', 'Bank', 'Banco', 'Owner', 'Dueño')
        or parent_id in (select id from public.bank_categories where tenant_id = t and name in ('Operating expenses', 'Gastos de operación', 'Bank', 'Banco', 'Owner', 'Dueño'))
        or (name in ('Cash deposit', 'Other income') and parent_id in (select id from public.bank_categories where tenant_id = t and name = 'Income'))
      );
  end loop;
end $$;
