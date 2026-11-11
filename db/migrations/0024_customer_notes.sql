-- Private notes can be attached to a customer ("My Notes" on the customer page). Still visible only to their author.
alter table public.user_notes add column customer_id uuid;
alter table public.user_notes add constraint user_notes_customer_fkey
  foreign key (tenant_id, customer_id) references public.customers(tenant_id, id) deferrable initially deferred;
create index user_notes_customer_idx on public.user_notes(tenant_id, user_id, customer_id, created_at desc) where customer_id is not null;
