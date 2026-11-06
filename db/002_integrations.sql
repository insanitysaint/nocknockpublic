-- API keys the company stores for AI tools and lead sources. The key is encrypted by the app (AES-256-GCM)
-- before it reaches this table; the database never sees the plain key, and no query returns it to a browser.
create table integrations (
  org_id      uuid not null references organizations(id) on delete cascade,
  provider    text not null check (provider in ('anthropic', 'openai', 'gemini', 'deepseek', 'apify', 'firecrawl', 'apollo')),
  secret      text not null,
  last4       text not null,
  created_by  uuid references users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (org_id, provider)
);
