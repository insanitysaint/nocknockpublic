import { context } from './_lib/ctx.js'
import {
  TenancyError, changeRole, inviteMember, listInvites, listMembers, orgsOf, removeMember, revokeInvite,
  scopeFor, seatUsage, type Db, type Role,
} from './_lib/tenancy.js'

// Company, seats and members for the signed-in user. Every call re-checks membership; nothing is trusted from the cookie but the email.

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
const STATUS: Record<string, number> = { forbidden: 403, org_paused: 403, not_found: 404, seat_limit: 409, already_member: 409, already_invited: 409 }

async function view(db: Db, userId: string, orgs: Awaited<ReturnType<typeof orgsOf>>, orgId: string) {
  const scope = await scopeFor(db, userId, orgId)
  const org = orgs.find((o) => o.id === orgId)!
  return {
    orgs: orgs.map((o) => ({ id: o.id, name: o.name, role: o.role })),
    org: { id: org.id, name: org.name, role: scope.role, allowed_domain: org.allowed_domain },
    seats: await seatUsage(db, scope),
    members: await listMembers(db, scope),
    invites: scope.role === 'owner' ? await listInvites(db, scope) : [],
  }
}

const fail = (e: unknown) => {
  if (e instanceof TenancyError) return json({ error: e.message === e.code ? e.code : e.message, code: e.code }, STATUS[e.code] ?? 400)
  console.error('team', e)
  return json({ error: 'Something went wrong.' }, 500)
}

export async function GET(request: Request): Promise<Response> {
  const c = await context(request, new URL(request.url).searchParams.get('org'))
  if ('res' in c && c.res) return c.res
  const { db, userId, orgs, org } = c as Exclude<typeof c, { res: Response }>
  if (!db || !userId || !org) return json({ orgs: [], org: null })
  try { return json(await view(db, userId, orgs!, org.id)) } catch (e) { return fail(e) }
}

export async function POST(request: Request): Promise<Response> {
  let b: Record<string, unknown>
  try { b = (await request.json()) as Record<string, unknown> } catch { return json({ error: 'Bad request' }, 400) }
  const c = await context(request, typeof b.org === 'string' ? b.org : null)
  if ('res' in c && c.res) return c.res
  const { db, userId, orgs, org } = c as Exclude<typeof c, { res: Response }>
  if (!db || !userId || !org) return json({ error: 'forbidden' }, 403)
  try {
    const scope = await scopeFor(db, userId, org.id)
    const role = b.role as Role
    switch (b.action) {
      case 'invite': await inviteMember(db, scope, { email: String(b.email ?? ''), role }); break
      case 'revoke': await revokeInvite(db, scope, String(b.id ?? '')); break
      case 'role': await changeRole(db, scope, String(b.user_id ?? ''), role); break
      case 'remove': await removeMember(db, scope, String(b.user_id ?? '')); break
      default: return json({ error: 'Unknown action' }, 400)
    }
    return json(await view(db, userId, orgs!, org.id))
  } catch (e) { return fail(e) }
}
