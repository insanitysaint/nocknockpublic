// Organisations, seats, roles and tenant-scoped data access.
//
// The one rule: data is only reachable through a Scope, and a Scope is only issued by scopeFor(),
// which proves the user is a member of that company and the company is not paused.
// Every data function takes a Scope and puts scope.orgId in its WHERE clause.

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>
}

export type Role = 'owner' | 'manager' | 'viewer'
export type Action = 'read' | 'write_leads' | 'approve_leads' | 'manage_members' | 'manage_integrations' | 'use_integrations'

const PERMISSIONS: Record<Action, readonly Role[]> = {
  read: ['owner', 'manager', 'viewer'],
  write_leads: ['owner', 'manager'],
  approve_leads: ['owner', 'manager'],
  manage_members: ['owner'],
  // API keys: only owners store or remove them; managers can use a stored key to find leads.
  manage_integrations: ['owner'],
  use_integrations: ['owner', 'manager'],
}

export const can = (role: Role, action: Action) => PERMISSIONS[action].includes(role)

export type ErrorCode =
  | 'forbidden' | 'org_paused' | 'seat_limit' | 'already_member' | 'already_invited'
  | 'domain_not_allowed' | 'last_owner' | 'not_found' | 'invalid' | 'suppressed'

export class TenancyError extends Error {
  code: ErrorCode
  constructor(code: ErrorCode, message: string = code) {
    super(message)
    this.name = 'TenancyError'
    this.code = code
  }
}

export interface Scope {
  readonly orgId: string
  readonly userId: string
  readonly role: Role
}

// Scopes created anywhere other than scopeFor() are rejected, so a hand-built { orgId } cannot reach data.
const issued = new WeakSet<object>()

export function check(scope: Scope, action: Action): void {
  if (!scope || !issued.has(scope)) throw new TenancyError('forbidden', 'scope was not issued by scopeFor')
  if (!can(scope.role, action)) throw new TenancyError('forbidden', `${scope.role} cannot ${action}`)
}

export const normEmail = (e: string) => String(e || '').trim().toLowerCase()
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isEmail = (e: string) => e.length <= 254 && EMAIL.test(e)

// A database error raised by the seat trigger, or a unique clash, as a typed error.
function translate(e: unknown): never {
  const err = e as { message?: string; code?: string }
  if (err?.message?.includes('seat_limit')) throw new TenancyError('seat_limit', 'No seats left in this company')
  if (err?.code === '23505') throw new TenancyError('already_invited')
  throw e
}

// ---------------------------------------------------------------- people and companies

export interface User { id: string; email: string; name: string }
export interface Org { id: string; name: string; seat_limit: number; status: 'active' | 'paused'; allowed_domain: string | null }

export async function upsertUser(db: Db, p: { email: string; name?: string }): Promise<User> {
  const email = normEmail(p.email)
  if (!isEmail(email)) throw new TenancyError('invalid', 'invalid email')
  const r = await db.query<User>(
    `insert into users (email, name) values ($1, $2)
     on conflict (email) do update set name = case when users.name = '' then excluded.name else users.name end
     returning id, email, name`,
    [email, (p.name || '').trim()],
  )
  return r.rows[0]
}

// Operator action (you, not a customer): create a company and its first owner.
export async function createOrganization(db: Db, p: {
  name: string; ownerEmail: string; ownerName?: string; seatLimit?: number; allowedDomain?: string
}): Promise<{ org: Org; owner: User }> {
  return db.transaction(async (tx) => {
    const owner = await upsertUser(tx, { email: p.ownerEmail, name: p.ownerName })
    const domain = p.allowedDomain ? p.allowedDomain.trim().toLowerCase().replace(/^@/, '') : null
    const r = await tx.query<Org>(
      `insert into organizations (name, seat_limit, allowed_domain) values ($1, $2, $3)
       returning id, name, seat_limit, status, allowed_domain`,
      [p.name, p.seatLimit ?? 5, domain],
    )
    const org = r.rows[0]
    await tx.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'owner')`, [org.id, owner.id])
    await tx.query(`insert into audit_log (org_id, actor_id, action, detail) values ($1, $2, 'org.created', $3)`,
      [org.id, owner.id, JSON.stringify({ name: p.name, seat_limit: org.seat_limit })])
    return { org, owner }
  }).catch((e) => {
    if (e?.code === '23514') throw new TenancyError('invalid', 'seat limit must be between 1 and 10')
    throw e
  })
}

// Operator action: pause or resume a company instantly.
export async function setOrgStatus(db: Db, orgId: string, status: 'active' | 'paused'): Promise<void> {
  const r = await db.query(`update organizations set status = $2 where id = $1 returning id`, [orgId, status])
  if (!r.rows.length) throw new TenancyError('not_found')
  await db.query(`insert into audit_log (org_id, action, detail) values ($1, $2, '{}')`, [orgId, `org.${status}`])
}

// The only way to get a Scope.
export async function scopeFor(db: Db, userId: string, orgId: string): Promise<Scope> {
  const r = await db.query<{ role: Role; status: string }>(
    `select m.role, o.status from memberships m join organizations o on o.id = m.org_id
     where m.user_id = $1 and m.org_id = $2`,
    [userId, orgId],
  )
  // A company you do not belong to looks the same as one that does not exist.
  if (!r.rows.length) throw new TenancyError('forbidden')
  if (r.rows[0].status !== 'active') throw new TenancyError('org_paused', 'This company is paused')
  const scope: Scope = Object.freeze({ orgId, userId, role: r.rows[0].role })
  issued.add(scope)
  return scope
}

export async function orgsOf(db: Db, userId: string): Promise<(Org & { role: Role })[]> {
  const r = await db.query(
    `select o.id, o.name, o.seat_limit, o.status, o.allowed_domain, m.role
     from memberships m join organizations o on o.id = m.org_id where m.user_id = $1
     order by (select count(*) from memberships where org_id = o.id) desc, o.name`,
    [userId],
  )
  return r.rows
}

async function audit(db: Db, scope: Scope, action: string, detail: object = {}) {
  await db.query(`insert into audit_log (org_id, actor_id, action, detail) values ($1, $2, $3, $4)`,
    [scope.orgId, scope.userId, action, JSON.stringify(detail)])
}

// ---------------------------------------------------------------- seats and invites

export async function seatUsage(db: Db, scope: Scope): Promise<{ limit: number; members: number; pending: number; free: number }> {
  check(scope, 'read')
  const r = await db.query<{ limit: number; members: string; pending: string }>(
    `select o.seat_limit as limit,
            (select count(*) from memberships where org_id = o.id) as members,
            (select count(*) from invites where org_id = o.id and accepted_at is null) as pending
     from organizations o where o.id = $1`,
    [scope.orgId],
  )
  const { limit, members, pending } = r.rows[0]
  return { limit, members: Number(members), pending: Number(pending), free: limit - Number(members) - Number(pending) }
}

export async function inviteMember(db: Db, scope: Scope, p: { email: string; role: Role }): Promise<{ id: string }> {
  check(scope, 'manage_members')
  const email = normEmail(p.email)
  if (!isEmail(email)) throw new TenancyError('invalid', 'invalid email')
  if (!PERMISSIONS.read.includes(p.role)) throw new TenancyError('invalid', 'invalid role')

  const org = (await db.query<Org>(`select allowed_domain from organizations where id = $1`, [scope.orgId])).rows[0]
  if (org.allowed_domain && !email.endsWith('@' + org.allowed_domain)) {
    throw new TenancyError('domain_not_allowed', `Only @${org.allowed_domain} addresses can join`)
  }
  const existing = await db.query(
    `select 1 from memberships m join users u on u.id = m.user_id where m.org_id = $1 and u.email = $2`,
    [scope.orgId, email],
  )
  if (existing.rows.length) throw new TenancyError('already_member')

  try {
    const r = await db.transaction(async (tx) => {
      const ins = await tx.query<{ id: string }>(
        `insert into invites (org_id, email, role, invited_by) values ($1, $2, $3, $4) returning id`,
        [scope.orgId, email, p.role, scope.userId],
      )
      await audit(tx, scope, 'member.invited', { email, role: p.role })
      return ins.rows[0]
    })
    return r
  } catch (e) {
    return translate(e)
  }
}

export async function revokeInvite(db: Db, scope: Scope, inviteId: string): Promise<void> {
  check(scope, 'manage_members')
  const r = await db.query(
    `delete from invites where id = $1 and org_id = $2 and accepted_at is null returning email`,
    [inviteId, scope.orgId],
  )
  if (!r.rows.length) throw new TenancyError('not_found')
  await audit(db, scope, 'invite.revoked', { email: r.rows[0].email })
}

// Call at sign-in with an email the identity provider (Zoho or Google) has verified.
// Pending invites for that email become memberships; no extra seat is used because the invite already held one.
export async function acceptInvites(db: Db, p: { email: string; name?: string }): Promise<{ user: User; joined: string[] }> {
  const user = await upsertUser(db, p)
  const joined: string[] = []
  await db.transaction(async (tx) => {
    const pending = await tx.query<{ id: string; org_id: string; role: Role }>(
      `select id, org_id, role from invites where email = $1 and accepted_at is null for update`, [user.email])
    for (const inv of pending.rows) {
      await tx.query(`update invites set accepted_at = now() where id = $1`, [inv.id])
      const m = await tx.query(
        `insert into memberships (org_id, user_id, role) values ($1, $2, $3) on conflict do nothing returning org_id`,
        [inv.org_id, user.id, inv.role])
      if (m.rows.length) {
        joined.push(inv.org_id)
        await tx.query(`insert into audit_log (org_id, actor_id, action, detail) values ($1, $2, 'member.joined', $3)`,
          [inv.org_id, user.id, JSON.stringify({ role: inv.role })])
      }
    }
  })
  return { user, joined }
}

export interface Member { user_id: string; email: string; name: string; role: Role }

export async function listMembers(db: Db, scope: Scope): Promise<Member[]> {
  check(scope, 'read')
  const r = await db.query<Member>(
    `select u.id as user_id, u.email, u.name, m.role from memberships m join users u on u.id = m.user_id
     where m.org_id = $1 order by u.email`, [scope.orgId])
  return r.rows
}

async function ownerCount(db: Db, orgId: string): Promise<number> {
  const r = await db.query<{ n: string }>(`select count(*) as n from memberships where org_id = $1 and role = 'owner'`, [orgId])
  return Number(r.rows[0].n)
}

export async function changeRole(db: Db, scope: Scope, userId: string, role: Role): Promise<void> {
  check(scope, 'manage_members')
  await db.transaction(async (tx) => {
    await tx.query(`select 1 from organizations where id = $1 for update`, [scope.orgId])
    const cur = await tx.query<{ role: Role }>(`select role from memberships where org_id = $1 and user_id = $2`, [scope.orgId, userId])
    if (!cur.rows.length) throw new TenancyError('not_found')
    if (cur.rows[0].role === 'owner' && role !== 'owner' && (await ownerCount(tx, scope.orgId)) <= 1) {
      throw new TenancyError('last_owner', 'A company needs at least one owner')
    }
    await tx.query(`update memberships set role = $3 where org_id = $1 and user_id = $2`, [scope.orgId, userId, role])
    await audit(tx, scope, 'member.role_changed', { user_id: userId, role })
  })
}

export async function removeMember(db: Db, scope: Scope, userId: string): Promise<void> {
  check(scope, 'manage_members')
  await db.transaction(async (tx) => {
    await tx.query(`select 1 from organizations where id = $1 for update`, [scope.orgId])
    const cur = await tx.query<{ role: Role }>(`select role from memberships where org_id = $1 and user_id = $2`, [scope.orgId, userId])
    if (!cur.rows.length) throw new TenancyError('not_found')
    if (cur.rows[0].role === 'owner' && (await ownerCount(tx, scope.orgId)) <= 1) {
      throw new TenancyError('last_owner', 'A company needs at least one owner')
    }
    await tx.query(`delete from memberships where org_id = $1 and user_id = $2`, [scope.orgId, userId])
    await audit(tx, scope, 'member.removed', { user_id: userId })
  })
}

// ---------------------------------------------------------------- leads and suppression

export interface Lead { id: string; email: string; company: string; status: string }

export async function addLeads(db: Db, scope: Scope, rows: { email: string; company?: string }[]):
  Promise<{ added: number; duplicates: number; suppressed: number; invalid: number }> {
  check(scope, 'write_leads')
  const out = { added: 0, duplicates: 0, suppressed: 0, invalid: 0 }
  await db.transaction(async (tx) => {
    for (const row of rows) {
      const email = normEmail(row.email)
      if (!isEmail(email)) { out.invalid++; continue }
      const sup = await tx.query(`select 1 from suppression where org_id = $1 and email = $2`, [scope.orgId, email])
      if (sup.rows.length) { out.suppressed++; continue }
      const r = await tx.query(
        `insert into leads (org_id, email, company, created_by) values ($1, $2, $3, $4)
         on conflict (org_id, email) do nothing returning id`,
        [scope.orgId, email, (row.company || '').trim(), scope.userId])
      if (r.rows.length) out.added++; else out.duplicates++
    }
    await audit(tx, scope, 'leads.added', out)
  })
  return out
}

export async function listLeads(db: Db, scope: Scope, opts: { status?: string } = {}): Promise<Lead[]> {
  check(scope, 'read')
  const r = await db.query<Lead>(
    `select id, email, company, status from leads
     where org_id = $1 and ($2::text is null or status = $2) order by created_at, email`,
    [scope.orgId, opts.status ?? null])
  return r.rows
}

// Manual decisions only. Sent, replied, bounced and unsubscribed are set by the sender and the mail watchers.
export async function decideLead(db: Db, scope: Scope, leadId: string, status: 'review' | 'approved' | 'rejected'): Promise<void> {
  check(scope, 'approve_leads')
  const lead = await db.query<{ email: string; status: string }>(
    `select email, status from leads where id = $1 and org_id = $2`, [leadId, scope.orgId])
  if (!lead.rows.length) throw new TenancyError('not_found')
  const { email, status: current } = lead.rows[0]
  if (['sent', 'replied', 'bounced', 'unsubscribed'].includes(current)) {
    throw new TenancyError('invalid', `a ${current} lead cannot be changed`)
  }
  if (status === 'approved') {
    const sup = await db.query(`select 1 from suppression where org_id = $1 and email = $2`, [scope.orgId, email])
    if (sup.rows.length) throw new TenancyError('suppressed', 'This address is on the do-not-contact list')
  }
  await db.query(`update leads set status = $3 where id = $1 and org_id = $2`, [leadId, scope.orgId, status])
  await audit(db, scope, 'lead.decided', { lead_id: leadId, status })
}

export async function suppress(db: Db, scope: Scope, emailIn: string, reason: 'unsubscribed' | 'bounced' | 'complaint' | 'manual'): Promise<void> {
  check(scope, 'write_leads')
  const email = normEmail(emailIn)
  if (!isEmail(email)) throw new TenancyError('invalid', 'invalid email')
  await db.transaction(async (tx) => {
    await tx.query(`insert into suppression (org_id, email, reason) values ($1, $2, $3) on conflict (org_id, email) do nothing`,
      [scope.orgId, email, reason])
    // Anything not yet sent stops here. Sent leads keep their history.
    await tx.query(`update leads set status = 'unsubscribed' where org_id = $1 and email = $2 and status in ('review', 'approved')`,
      [scope.orgId, email])
    await audit(tx, scope, 'suppression.added', { email, reason })
  })
}

export async function listSuppressed(db: Db, scope: Scope): Promise<{ email: string; reason: string }[]> {
  check(scope, 'read')
  const r = await db.query(`select email, reason from suppression where org_id = $1 order by email`, [scope.orgId])
  return r.rows
}

export interface PendingInvite { id: string; email: string; role: Role; created_at: string }

export async function listInvites(db: Db, scope: Scope): Promise<PendingInvite[]> {
  check(scope, 'manage_members')
  const r = await db.query<PendingInvite>(
    `select id, email, role, created_at from invites where org_id = $1 and accepted_at is null order by created_at`, [scope.orgId])
  return r.rows
}

export async function findUserId(db: Db, emailIn: string): Promise<string | null> {
  const r = await db.query<{ id: string }>(`select id from users where email = $1`, [normEmail(emailIn)])
  return r.rows[0]?.id ?? null
}

// Everyone who signs in gets a workspace of their own, so keys, lead sources and uploads work for a solo user.
// A team is optional: invite people later and the same workspace gets members.
export async function ensureWorkspace(db: Db, p: { email: string; name?: string }): Promise<{ user: User; created: boolean }> {
  const user = await upsertUser(db, p)
  let created = false
  await db.transaction(async (tx) => {
    // Lock the user row so two requests arriving together cannot each create a workspace.
    await tx.query(`select 1 from users where id = $1 for update`, [user.id])
    const has = await tx.query(`select 1 from memberships where user_id = $1 limit 1`, [user.id])
    if (has.rows.length) return
    const first = (user.name || user.email.split('@')[0]).trim().split(/\s+/)[0]
    const org = (await tx.query<{ id: string }>(
      `insert into organizations (name) values ($1) returning id`, [`${first}'s workspace`])).rows[0]
    await tx.query(`insert into memberships (org_id, user_id, role) values ($1, $2, 'owner')`, [org.id, user.id])
    await tx.query(`insert into audit_log (org_id, actor_id, action, detail) values ($1, $2, 'org.created', '{"personal":true}')`, [org.id, user.id])
    created = true
  })
  return { user, created }
}
