import pg from 'pg'
import type { Db } from './tenancy.js'

// Postgres for the multi-company features. Without DATABASE_URL the app runs exactly as before (single owner, allow-list).

let override: Db | undefined
let pool: pg.Pool | undefined

// Tests inject an in-memory database here.
export function setDb(db: Db | undefined) { override = db }

function wrap(q: { query: (sql: string, params?: unknown[]) => Promise<pg.QueryResult> }): Pick<Db, 'query'> {
  return { query: async (sql, params) => ({ rows: (await q.query(sql, params)).rows }) }
}

export function getDb(): Db | null {
  if (override) return override
  const url = process.env.DATABASE_URL
  if (!url) return null
  pool ??= new pg.Pool({
    connectionString: url,
    max: 3,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  })
  const p = pool
  const db: Db = {
    ...wrap(p),
    async transaction(fn) {
      const client = await p.connect()
      try {
        await client.query('begin')
        // Calls made inside a transaction that open another one simply join it.
        const tx: Db = { ...wrap(client), transaction: (inner) => inner(tx) }
        const out = await fn(tx)
        await client.query('commit')
        return out
      } catch (e) {
        await client.query('rollback').catch(() => undefined)
        throw e
      } finally {
        client.release()
      }
    },
  }
  return db
}
