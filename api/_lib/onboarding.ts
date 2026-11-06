import { aiProviders, askAi } from './ai.js'
import { AI, isProvider, listIntegrations, saveKey, type Provider, type Status } from './integrations.js'
import { TenancyError, check, seatUsage, type Db, type Scope } from './tenancy.js'

// The first-run wizard: business type (decides seats), progress, API keys in one go, and the client persona.

export const BUSINESS = {
  solo: { label: 'Solopreneur', seats: 1 },
  agency: { label: 'Mid Size Agency', seats: 10 },
  startup: { label: 'Established Startup', seats: 20 },
} as const
export type BusinessType = keyof typeof BUSINESS
export const isBusiness = (t: unknown): t is BusinessType => typeof t === 'string' && Object.hasOwn(BUSINESS, t)

export interface Progress { step: number; done: boolean; skipped: string[] }
export interface Persona { mode: 'ai' | 'manual'; business: string; target: string; offer: string; persona: string; updated_at: string }

const STEPS = ['account', 'business', 'keys', 'persona', 'leads'] as const
const clean = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

export async function getOnboarding(db: Db, scope: Scope) {
  check(scope, 'read')
  const o = (await db.query<{ business_type: BusinessType | null; seat_limit: number; onboarding: Partial<Progress> }>(
    `select business_type, seat_limit, onboarding from organizations where id = $1`, [scope.orgId])).rows[0]
  const persona = (await db.query<Persona>(
    `select mode, business, target, offer, persona, updated_at from personas where org_id = $1`, [scope.orgId])).rows[0] ?? null
  const integrations: Status[] = await listIntegrations(db, scope)
  const progress: Progress = { step: o.onboarding.step ?? 2, done: !!o.onboarding.done, skipped: o.onboarding.skipped ?? [] }
  return {
    role: scope.role,
    business_type: o.business_type,
    seats: await seatUsage(db, scope),
    progress,
    persona,
    integrations,
    ai_ready: integrations.some((i) => i.connected && (AI as readonly string[]).includes(i.provider)),
  }
}

// Business type sets the seat limit. Choosing a smaller plan than the people already seated is refused.
export async function setBusinessType(db: Db, scope: Scope, type: unknown): Promise<void> {
  check(scope, 'manage_members')
  if (!isBusiness(type)) throw new TenancyError('invalid', 'Pick one of the three business types')
  await db.transaction(async (tx) => {
    await tx.query(`select 1 from organizations where id = $1 for update`, [scope.orgId])
    const u = await seatUsage(tx, scope)
    const seats = BUSINESS[type].seats
    const used = u.members + u.pending
    if (used > seats) throw new TenancyError('seat_limit', `You already have ${used} people on this company; that plan has ${seats} seat${seats === 1 ? '' : 's'}.`)
    await tx.query(`update organizations set business_type = $2, seat_limit = $3 where id = $1`, [scope.orgId, type, seats])
    await tx.query(`insert into audit_log (org_id, actor_id, action, detail) values ($1, $2, 'onboarding.business', $3)`,
      [scope.orgId, scope.userId, JSON.stringify({ type, seats })])
  })
}

// Remember how far the wizard got, and what was skipped, so a refresh or a return visit resumes in the right place.
export async function saveProgress(db: Db, scope: Scope, p: { step?: unknown; done?: unknown; skipped?: unknown }): Promise<void> {
  check(scope, 'manage_members')
  const step = Math.min(Math.max(Math.trunc(Number(p.step) || 1), 1), STEPS.length)
  const skipped = (Array.isArray(p.skipped) ? p.skipped : []).map(String).filter((s) => (STEPS as readonly string[]).includes(s))
  await db.query(`update organizations set onboarding = $2 where id = $1`,
    [scope.orgId, JSON.stringify({ step, done: p.done === true, skipped: [...new Set(skipped)] })])
}

// All the keys from step 3 in one go. Each is checked with its provider; one bad key does not stop the others.
export interface KeyResult { provider: string; status: 'connected' | 'unverified' | 'rejected' | 'invalid' | 'error'; message?: string }
export async function saveKeys(db: Db, scope: Scope, keys: Record<string, unknown>): Promise<KeyResult[]> {
  check(scope, 'manage_integrations')
  const out: KeyResult[] = []
  for (const [provider, raw] of Object.entries(keys)) {
    const key = clean(raw, 400)
    if (!key) continue
    if (!isProvider(provider)) { out.push({ provider, status: 'invalid', message: 'Unknown provider' }); continue }
    try {
      const { verified } = await saveKey(db, scope, provider as Provider, key)
      out.push({ provider, status: verified ? 'connected' : 'unverified' })
    } catch (e) {
      if (e instanceof TenancyError) out.push({ provider, status: e.message.includes('rejected') ? 'rejected' : 'invalid', message: e.message })
      else out.push({ provider, status: 'error', message: 'Could not check this key. Try again.' })
    }
  }
  return out
}

// ---------------------------------------------------------------- persona

const SYSTEM = `You are a B2B outbound strategist. From the three answers you are given, write a client persona for cold email.
Use these headings, plain text, no markdown symbols, under 220 words in total:
Ideal client: (company type, size, region)
Decision maker: (job titles)
Pains: (three short points)
Buying triggers: (three short points)
Angle for the first email: (one sentence)
Follow-up angle: (one sentence)
Only use what the answers support; do not invent facts about the sender.`

export async function savePersona(db: Db, scope: Scope, p: { mode?: unknown; business?: unknown; target?: unknown; offer?: unknown; persona?: unknown }): Promise<Persona> {
  check(scope, 'write_leads')
  const mode = p.mode === 'manual' ? 'manual' : p.mode === 'ai' ? 'ai' : null
  if (!mode) throw new TenancyError('invalid', 'Choose AI enabled or Manual persona')
  const business = clean(p.business, 600), target = clean(p.target, 600), offer = clean(p.offer, 800)
  let persona = clean(p.persona, 4000)
  if (mode === 'ai') {
    if (business.length < 3 || target.length < 3 || offer.length < 3) throw new TenancyError('invalid', 'Answer all three questions first')
    if (!(await aiProviders(db, scope)).length) throw new TenancyError('not_found', 'Add an AI key to use the AI persona, or switch to Manual')
    persona = await askAi(db, scope, SYSTEM, `What the business does: ${business}\nWho they want to reach: ${target}\nWhat they offer: ${offer}`)
  } else if (persona.length < 20) {
    throw new TenancyError('invalid', 'Write the persona (at least a couple of sentences)')
  }
  const r = await db.query<Persona>(
    `insert into personas (org_id, mode, business, target, offer, persona, created_by) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (org_id) do update set mode = excluded.mode, business = excluded.business, target = excluded.target,
       offer = excluded.offer, persona = excluded.persona, created_by = excluded.created_by, updated_at = now()
     returning mode, business, target, offer, persona, updated_at`,
    [scope.orgId, mode, business, target, offer, persona, scope.userId])
  await db.query(`insert into audit_log (org_id, actor_id, action, detail) values ($1, $2, 'persona.saved', $3)`,
    [scope.orgId, scope.userId, JSON.stringify({ mode })])
  return r.rows[0]
}
