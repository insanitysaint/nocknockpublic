-- Onboarding wizard: business type decides seats (1 / 10 / 20), email+password accounts, and the client persona.

-- Seats go up to 20 (the "Established Startup" plan).
alter table organizations drop constraint organizations_seat_limit_check;
alter table organizations add constraint organizations_seat_limit_check check (seat_limit between 1 and 20);

-- solo = 1 seat, agency = 10, startup = 20. Null until the person picks one.
alter table organizations add column business_type text check (business_type in ('solo', 'agency', 'startup'));
-- Wizard progress per company: { "step": 3, "done": true, "skipped": ["keys"] }
alter table organizations add column onboarding jsonb not null default '{}';

-- Accounts that sign up with an email and a password (scrypt$salt$hash, same format as the operator logins).
alter table users add column password_hash text;

-- The client persona the AI (or the owner) wrote: who to target and what to offer. One per company.
create table personas (
  org_id      uuid primary key references organizations(id) on delete cascade,
  mode        text not null check (mode in ('ai', 'manual')),
  business    text not null default '',
  target      text not null default '',
  offer       text not null default '',
  persona     text not null default '',
  created_by  uuid references users(id) on delete set null,
  updated_at  timestamptz not null default now()
);
