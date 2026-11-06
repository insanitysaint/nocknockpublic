// Sets up (or updates) the database tables for sign-up, companies, seats, API keys and personas.
// Needs DATABASE_URL (a Postgres connection string, for example from Supabase).  Run:  node scripts/migrate.mjs
// Safe to run again: each file in db/ is applied once and remembered.
import { readFileSync, readdirSync } from 'node:fs'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) { console.error('Set DATABASE_URL first.'); process.exit(1) }
const pool = new pg.Pool({ connectionString: url, max: 1, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } })
try {
  await pool.query('create table if not exists schema_migrations (name text primary key, at timestamptz not null default now())')
  const dir = new URL('../db/', import.meta.url)
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    if ((await pool.query('select 1 from schema_migrations where name = $1', [f])).rows.length) continue
    await pool.query(readFileSync(new URL(f, dir), 'utf8'))
    await pool.query('insert into schema_migrations (name) values ($1)', [f])
    console.log('Applied ' + f)
  }
  console.log('Database is up to date.')
} finally { await pool.end() }
