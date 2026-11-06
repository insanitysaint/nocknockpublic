import { decrypt, encrypt } from './secrets.js'
import { TenancyError, addLeads, check, type Db, type Scope } from './tenancy.js'

// Stored API keys (AI tools and lead sources) and the "find leads" calls that use them.
// Keys are encrypted at rest and only ever decrypted on the server for a single outgoing call. Nothing returns one.

export const AI = ['anthropic', 'openai', 'gemini', 'deepseek'] as const
export const SOURCES = ['apify', 'firecrawl', 'apollo'] as const
export type Provider = (typeof AI)[number] | (typeof SOURCES)[number]
export const isProvider = (p: unknown): p is Provider => [...AI, ...SOURCES].includes(p as never)

export interface Status { provider: Provider; connected: boolean; last4?: string; updated_at?: string }

type Fetch = typeof fetch
let doFetch: Fetch = (...a) => fetch(...a)
// Tests replace the network with a fake.
export const setFetch = (f: Fetch | undefined) => { doFetch = f ?? ((...a) => fetch(...a)) }

const TIMEOUT = 50_000

// ---------------------------------------------------------------- stored keys

export async function listIntegrations(db: Db, scope: Scope): Promise<Status[]> {
  check(scope, 'read')
  const r = await db.query<{ provider: Provider; last4: string; updated_at: string }>(
    `select provider, last4, updated_at from integrations where org_id = $1`, [scope.orgId])
  const have = new Map(r.rows.map((x) => [x.provider, x]))
  return [...AI, ...SOURCES].map((p) => {
    const x = have.get(p)
    return x ? { provider: p, connected: true, last4: x.last4, updated_at: x.updated_at } : { provider: p, connected: false }
  })
}

// Checks the key with the provider (a free call), then stores it encrypted. A rejected key is never stored.
export async function saveKey(db: Db, scope: Scope, provider: Provider, rawKey: string): Promise<{ verified: boolean }> {
  check(scope, 'manage_integrations')
  const apiKey = String(rawKey || '').trim()
  if (apiKey.length < 8 || apiKey.length > 400 || /\s/.test(apiKey)) throw new TenancyError('invalid', 'That does not look like an API key')
  const v = await verify(provider, apiKey)
  if (v === 'rejected') throw new TenancyError('invalid', 'The provider rejected this key')
  await db.query(
    `insert into integrations (org_id, provider, secret, last4, created_by) values ($1, $2, $3, $4, $5)
     on conflict (org_id, provider) do update set secret = excluded.secret, last4 = excluded.last4,
       created_by = excluded.created_by, updated_at = now()`,
    [scope.orgId, provider, encrypt(apiKey), apiKey.slice(-4), scope.userId])
  await db.query(`insert into audit_log (org_id, actor_id, action, detail) values ($1, $2, 'integration.saved', $3)`,
    [scope.orgId, scope.userId, JSON.stringify({ provider })])
  return { verified: v === 'ok' }
}

export async function removeKey(db: Db, scope: Scope, provider: Provider): Promise<void> {
  check(scope, 'manage_integrations')
  await db.query(`delete from integrations where org_id = $1 and provider = $2`, [scope.orgId, provider])
  await db.query(`insert into audit_log (org_id, actor_id, action, detail) values ($1, $2, 'integration.removed', $3)`,
    [scope.orgId, scope.userId, JSON.stringify({ provider })])
}

export const currentFetch = () => doFetch

export async function getKey(db: Db, scope: Scope, provider: Provider): Promise<string> {
  check(scope, 'use_integrations')
  const r = await db.query<{ secret: string }>(`select secret from integrations where org_id = $1 and provider = $2`, [scope.orgId, provider])
  if (!r.rows.length) throw new TenancyError('not_found', `Add your ${provider} key first`)
  return decrypt(r.rows[0].secret)
}

// ---------------------------------------------------------------- verifying a key

const CHECKS: Record<Provider, (k: string) => [string, RequestInit]> = {
  anthropic: (k) => ['https://api.anthropic.com/v1/models', { headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01' } }],
  openai: (k) => ['https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${k}` } }],
  gemini: (k) => ['https://generativelanguage.googleapis.com/v1beta/models', { headers: { 'x-goog-api-key': k } }],
  deepseek: (k) => ['https://api.deepseek.com/models', { headers: { authorization: `Bearer ${k}` } }],
  apify: (k) => ['https://api.apify.com/v2/users/me', { headers: { authorization: `Bearer ${k}` } }],
  firecrawl: (k) => ['https://api.firecrawl.dev/v1/team/credit-usage', { headers: { authorization: `Bearer ${k}` } }],
  apollo: (k) => ['https://api.apollo.io/api/v1/auth/health', { headers: { 'x-api-key': k } }],
}

// 'ok' = accepted, 'rejected' = the provider says the key is wrong, 'unknown' = could not tell (network, odd answer).
export async function verify(provider: Provider, apiKey: string): Promise<'ok' | 'rejected' | 'unknown'> {
  const [url, init] = CHECKS[provider](apiKey)
  try {
    const r = await doFetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
    if (r.ok) return 'ok'
    return r.status === 401 || r.status === 403 ? 'rejected' : 'unknown'
  } catch {
    return 'unknown'
  }
}

// ---------------------------------------------------------------- finding leads

export interface Candidate { email: string; company: string; name?: string; title?: string; source: string; apollo_id?: string }

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi
const NOT_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$/i

export function extractEmails(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.match(EMAIL_RE) ?? []) {
    const e = m.toLowerCase().replace(/^[._%+-]+/, '')
    if (!NOT_EMAIL.test(e) && !e.includes('example.') && !e.startsWith('email_not_unlocked')) out.add(e)
  }
  return [...out]
}

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
const domainOf = (email: string) => email.split('@')[1] ?? ''

async function json(r: Response, what: string): Promise<any> {
  if (r.status === 401 || r.status === 403) throw new TenancyError('invalid', `${what} rejected the key. Add it again.`)
  if (r.status === 402 || r.status === 429) throw new TenancyError('invalid', `${what} says you are out of credits or sending too fast.`)
  if (!r.ok) throw new TenancyError('invalid', `${what} returned an error (${r.status}).`)
  return r.json()
}

export interface FindInput {
  source: (typeof SOURCES)[number]
  urls?: string[]                 // firecrawl
  actor?: string; input?: unknown // apify
  titles?: string[]; domains?: string[]; limit?: number // apollo
}

export async function findLeads(db: Db, scope: Scope, p: FindInput): Promise<{ candidates: Candidate[]; note?: string }> {
  if (!SOURCES.includes(p.source)) throw new TenancyError('invalid', 'Unknown source')
  const key = await getKey(db, scope, p.source)
  const signal = () => AbortSignal.timeout(TIMEOUT)
  const seen = new Map<string, Candidate>()
  const add = (c: Candidate) => { if (!seen.has(c.email) && seen.size < 200) seen.set(c.email, c) }

  if (p.source === 'firecrawl') {
    const urls = (p.urls ?? []).map((u) => u.trim()).filter(Boolean).slice(0, 5)
    if (!urls.length) throw new TenancyError('invalid', 'Add at least one web address')
    for (const u of urls) {
      if (!/^https?:\/\//i.test(u)) throw new TenancyError('invalid', `${u} is not a web address`)
      const r = await doFetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST', signal: signal(),
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ url: u, formats: ['markdown'] }),
      })
      const j = await json(r, 'Firecrawl')
      const text = String(j?.data?.markdown ?? '')
      const title = String(j?.data?.metadata?.title ?? '').trim()
      for (const e of extractEmails(text)) add({ email: e, company: title || host(u) || domainOf(e), source: u })
    }
  } else if (p.source === 'apify') {
    const actor = String(p.actor ?? '').trim().replace('/', '~')
    if (!/^[\w.-]+~[\w.-]+$/.test(actor)) throw new TenancyError('invalid', 'Actor looks like "username/actor-name"')
    const body = JSON.stringify(p.input ?? {})
    if (body.length > 20_000) throw new TenancyError('invalid', 'Actor input is too large')
    const r = await doFetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?timeout=45&limit=200`, {
      method: 'POST', signal: signal(), headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body,
    })
    const items = await json(r, 'Apify')
    for (const it of Array.isArray(items) ? items : []) {
      const label = String(it?.name ?? it?.title ?? it?.companyName ?? '').trim()
      const src = String(it?.url ?? it?.website ?? '')
      for (const e of extractEmails(JSON.stringify(it))) add({ email: e, company: label || host(src) || domainOf(e), source: `apify:${actor}` })
    }
  } else {
    const domains = (p.domains ?? []).map((d) => d.trim().toLowerCase()).filter(Boolean).slice(0, 10)
    const titles = (p.titles ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 10)
    if (!domains.length) throw new TenancyError('invalid', 'Add at least one company domain')
    const r = await doFetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
      method: 'POST', signal: signal(), headers: { 'x-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ q_organization_domains_list: domains, person_titles: titles, per_page: Math.min(p.limit ?? 25, 50), page: 1 }),
    })
    const j = await json(r, 'Apollo')
    for (const x of j?.people ?? []) {
      const org = x?.organization?.name ?? ''
      const name = [x?.first_name, x?.last_name].filter(Boolean).join(' ')
      // Apollo's free search hides emails; those people come back without one and can be revealed (costs credits).
      add({ email: extractEmails(String(x?.email ?? ''))[0] ?? `pending:${x?.id}`, company: org, name, title: x?.title, source: 'apollo', apollo_id: x?.id })
    }
    return { candidates: [...seen.values()], note: 'Apollo hides emails in search. Select people and use Reveal emails (uses Apollo credits).' }
  }
  return { candidates: [...seen.values()] }
}

// Apollo: turn chosen people into emails. This spends the company's Apollo credits, so it is explicit and capped at 10.
export async function revealApollo(db: Db, scope: Scope, ids: string[]): Promise<Candidate[]> {
  const key = await getKey(db, scope, 'apollo')
  const chosen = ids.filter((i) => /^[\w-]{6,40}$/.test(i)).slice(0, 10)
  if (!chosen.length) throw new TenancyError('invalid', 'Pick at least one person')
  const r = await doFetch('https://api.apollo.io/api/v1/people/bulk_match', {
    method: 'POST', signal: AbortSignal.timeout(TIMEOUT), headers: { 'x-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ details: chosen.map((id) => ({ id })) }),
  })
  const j = await json(r, 'Apollo')
  const out: Candidate[] = []
  for (const m of j?.matches ?? []) {
    const email = extractEmails(String(m?.email ?? ''))[0]
    if (email) out.push({ email, company: m?.organization?.name ?? domainOf(email), name: [m?.first_name, m?.last_name].filter(Boolean).join(' '), title: m?.title, source: 'apollo', apollo_id: m?.id })
  }
  return out
}

// Adds chosen candidates to the company's leads as "review". Nothing is approved automatically.
export async function importCandidates(db: Db, scope: Scope, rows: { email: string; company?: string }[]) {
  return addLeads(db, scope, rows.filter((r) => r.email && !String(r.email).startsWith('pending:')).slice(0, 200))
}
