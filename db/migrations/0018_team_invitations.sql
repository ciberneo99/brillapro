-- Phase 9b+: invite people to a company and manage the team.
-- Invitations are links the owner/admin copies and sends themselves (no email provider is connected).
-- Only a hash of the token is stored; the raw token is shown once, when the invitation is created.

create table public.invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  email       text not null check (email = lower(email) and char_length(email) between 3 and 254),
  role        text not null check (role in ('admin','manager','office_staff','employee','accountant')),
  token_hash  text not null unique,
  status      text not null default 'pending' check (status in ('pending','accepted','revoked')),
  invited_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
create index invitations_tenant_idx on public.invitations(tenant_id, status);

alter table public.invitations enable row level security;
create policy invitations_select on public.invitations for select to authenticated
  using (public.has_role(tenant_id, array['owner','admin']));
-- All writes go through the functions below.
revoke all on public.invitations from anon, authenticated;
grant select on public.invitations to authenticated;

-- Create (or replace) an invitation. Returns the raw token, which is never stored.
create or replace function public.create_invitation(p_tenant uuid, p_email text, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare em text := lower(trim(p_email)); tok text; lim integer; used integer;
begin
  if auth.uid() is null or not public.has_role(p_tenant, array['owner','admin']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_role not in ('admin','manager','office_staff','employee','accountant') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if p_role = 'admin' and not public.has_role(p_tenant, array['owner']) then
    raise exception 'only the owner can invite administrators' using errcode = '42501';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;

  perform 1 from public.tenants where id = p_tenant for update;
  if exists (select 1 from public.memberships m join public.profiles p on p.id = m.user_id
             where m.tenant_id = p_tenant and m.status = 'active' and lower(p.email) = em) then
    raise exception 'already a member' using errcode = '23505';
  end if;
  update public.invitations set status = 'revoked' where tenant_id = p_tenant and email = em and status = 'pending';

  -- Pending invitations reserve a seat so the plan limit can't be exceeded when they are accepted.
  lim := public.tenant_plan_limit(p_tenant, 'max_users');
  if lim is not null then
    select (select count(*) from public.memberships where tenant_id = p_tenant and status = 'active')
         + (select count(*) from public.invitations where tenant_id = p_tenant and status = 'pending' and expires_at > now())
      into used;
    if used >= lim then raise exception 'plan user limit reached' using errcode = '23514'; end if;
  end if;

  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invitations (tenant_id, email, role, token_hash, invited_by)
    values (p_tenant, em, p_role, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), auth.uid());
  insert into public.audit_log (tenant_id, actor_id, action, entity, metadata)
    values (p_tenant, auth.uid(), 'invitation.created', 'invitation', jsonb_build_object('email', em, 'role', p_role));
  return tok;
end $$;

create or replace function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare tid uuid;
begin
  select tenant_id into tid from public.invitations where id = p_id and status = 'pending';
  if tid is null or auth.uid() is null or not public.has_role(tid, array['owner','admin']) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.invitations set status = 'revoked' where id = p_id;
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id)
    values (tid, auth.uid(), 'invitation.revoked', 'invitation', p_id::text);
end $$;

-- What the invited person sees before accepting. Only returns a row for a valid pending token
-- whose email matches the signed-in account.
create or replace function public.invitation_preview(p_token text) returns table (company text, role text, email text)
language sql stable security definer set search_path = '' as $$
  select t.name, i.role, i.email
  from public.invitations i
  join public.tenants t on t.id = i.tenant_id
  where i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
    and i.status = 'pending' and i.expires_at > now()
    and auth.uid() is not null
    and i.email = (select lower(u.email) from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
$$;

create or replace function public.accept_invitation(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
declare inv public.invitations%rowtype; uemail text;
begin
  if auth.uid() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select lower(u.email) into uemail from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null;
  select * into inv from public.invitations
    where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and status = 'pending' and expires_at > now()
    for update;
  if not found or uemail is null or inv.email <> uemail then
    raise exception 'invalid invitation' using errcode = '42501';
  end if;
  -- One company per person for now (the app opens the first active membership).
  if exists (select 1 from public.memberships where user_id = auth.uid() and status = 'active' and tenant_id <> inv.tenant_id) then
    raise exception 'already in another company' using errcode = '23505';
  end if;
  insert into public.memberships (tenant_id, user_id, role) values (inv.tenant_id, auth.uid(), inv.role)
    on conflict (tenant_id, user_id) do update set role = excluded.role, status = 'active';
  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, metadata)
    values (inv.tenant_id, auth.uid(), 'invitation.accepted', 'invitation', inv.id::text, jsonb_build_object('role', inv.role));
end $$;

revoke all on function public.create_invitation(uuid, text, text), public.revoke_invitation(uuid),
  public.invitation_preview(text), public.accept_invitation(text) from public, anon;
grant execute on function public.create_invitation(uuid, text, text), public.revoke_invitation(uuid),
  public.invitation_preview(text), public.accept_invitation(text) to authenticated;

-- The company can never be left without an active owner, and people can't demote or disable themselves.
create or replace function public.memberships_protect_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and old.status = 'active' and (new.role <> 'owner' or new.status <> 'active') then
    if not exists (select 1 from public.memberships where tenant_id = old.tenant_id and role = 'owner' and status = 'active' and id <> old.id) then
      raise exception 'a company needs at least one owner' using errcode = '23514';
    end if;
  end if;
  if auth.uid() is not null and old.user_id = auth.uid() and (new.role <> old.role or new.status <> old.status) then
    raise exception 'you cannot change your own access' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger memberships_protect before update of role, status on public.memberships
  for each row execute function public.memberships_protect_owner();
