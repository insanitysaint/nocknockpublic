import { getDb } from './db.js'
import { allowed, type Session } from './session.js'
import { acceptInvites, orgsOf } from './tenancy.js'

// Operators are you and anyone you set up by hand (ALLOWED_EMAILS, or a password login). They see the cockpit and your
// engine data. Customers who only hold a seat in some other company get the company pages, never your leads.
export const isOperator = (s: Pick<Session, 'email' | 'provider'>) => s.provider === 'password' || allowed(s.email)

// What a signed-in person may do with the engine (the cockpit data):
//   'full'    an operator
//   'manager' a member (owner or manager) of a workspace an operator owns: everything the cockpit does
//   'viewer'  a viewer in such a workspace: look, but change nothing
//   null      no engine access
export type EngineAccess = 'full' | 'manager' | 'viewer' | null

export async function engineAccess(s: Pick<Session, 'email' | 'provider'>): Promise<EngineAccess> {
  if (isOperator(s)) return 'full'
  const db = getDb()
  if (!db) return null
  const operators = (process.env.ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (!operators.length) return null
  try {
    const r = await db.query<{ role: string }>(
      `select m.role from memberships m
         join users u on u.id = m.user_id
         join organizations o on o.id = m.org_id and o.status = 'active'
       where u.email = $1
         and exists (select 1 from memberships om join users ou on ou.id = om.user_id
                     where om.org_id = m.org_id and om.role = 'owner' and ou.email = any($2::text[]))`,
      [s.email.toLowerCase(), operators])
    if (!r.rows.length) return null
    return r.rows.some((x) => x.role !== 'viewer') ? 'manager' : 'viewer'
  } catch (e) {
    console.error('engineAccess failed', e)
    return null
  }
}

// Decides whether a verified identity may sign in. Pending invites are turned into memberships on the way.
export async function admit(email: string, name: string): Promise<boolean> {
  const operator = allowed(email)
  const db = getDb()
  if (!db) return operator
  try {
    const { user } = await acceptInvites(db, { email, name })
    return operator || (await orgsOf(db, user.id)).length > 0
  } catch (e) {
    console.error('admit failed', e)
    return operator
  }
}
