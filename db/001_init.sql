-- Nocknock platform: identity and tenancy foundation.
-- Rule: every table except users and organizations carries org_id, and every query on it filters by org_id.
-- test/schema.test.ts fails if a new table breaks that rule.

create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique check (email = lower(email)),
  name        text not null default '',
  created_at  timestamptz not null default now()
);

create table organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  -- 5 seats by default, 10 on the higher plan. A seat is an active member or a pending invite.
  seat_limit      int  not null default 5 check (seat_limit between 1 and 10),
  -- 'paused' is the admin kill switch: nobody in the company can act until it is lifted.
  status          text not null default 'active' check (status in ('active', 'paused')),
  -- Optional: only emails on this domain may be invited (a Google Workspace or Zoho company domain).
  allowed_domain  text check (allowed_domain is null or allowed_domain = lower(allowed_domain)),
  created_at      timestamptz not null default now()
);

create table memberships (
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null check (role in ('owner', 'manager', 'viewer')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table invites (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  email        text not null check (email = lower(email)),
  role         text not null check (role in ('owner', 'manager', 'viewer')),
  invited_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz
);
-- One pending invite per person per company.
create unique index invites_pending on invites (org_id, email) where accepted_at is null;

-- Seat cap, enforced in the database as well as in code so no code path can exceed it.
create function enforce_seat_limit() returns trigger language plpgsql as $$
declare
  cap int;
  used int;
begin
  -- Lock the company row so two simultaneous invites cannot both take the last seat.
  select seat_limit into cap from organizations where id = new.org_id for update;
  select (select count(*) from memberships where org_id = new.org_id)
       + (select count(*) from invites where org_id = new.org_id and accepted_at is null)
    into used;
  if used + 1 > cap then
    raise exception 'seat_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger memberships_seats before insert on memberships
  for each row execute function enforce_seat_limit();
create trigger invites_seats before insert on invites
  for each row when (new.accepted_at is null) execute function enforce_seat_limit();

-- A pending invite converts into a membership without taking a second seat:
-- the invite is marked accepted first, then the membership row is inserted.

create table leads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null check (email = lower(email)),
  company     text not null default '',
  -- 'review' until verified and approved; the sender only ever picks 'approved'.
  status      text not null default 'review' check (status in ('review', 'approved', 'rejected', 'sent', 'replied', 'bounced', 'unsubscribed')),
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, email)
);
create index leads_org_status on leads (org_id, status);

-- Do-not-contact list, per company.
create table suppression (
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null check (email = lower(email)),
  reason      text not null check (reason in ('unsubscribed', 'bounced', 'complaint', 'manual')),
  created_at  timestamptz not null default now(),
  primary key (org_id, email)
);

create table audit_log (
  id        bigserial primary key,
  org_id    uuid not null references organizations(id) on delete cascade,
  actor_id  uuid references users(id) on delete set null,
  action    text not null,
  detail    jsonb not null default '{}',
  at        timestamptz not null default now()
);
create index audit_org_at on audit_log (org_id, at desc);
