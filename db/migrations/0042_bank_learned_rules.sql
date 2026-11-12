-- What the company chose for each merchant, so the next statement is sorted the same way. Counts only: no statement text is kept beyond the merchant word.

create table public.bank_learned_rules (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  pattern     text not null check (char_length(pattern) between 2 and 60),
  category_id uuid not null,
  hits        integer not null default 1 check (hits > 0),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, pattern, category_id),
  foreign key (tenant_id, category_id) references public.bank_categories (tenant_id, id) on delete cascade
);

alter table public.bank_learned_rules enable row level security;
create policy bank_learned_rules_all on public.bank_learned_rules for all to authenticated
  using (public.has_role(tenant_id, array['owner','admin','accountant']))
  with check (public.has_role(tenant_id, array['owner','admin','accountant']));
grant select, insert, update, delete on public.bank_learned_rules to authenticated;
revoke all on public.bank_learned_rules from anon;
