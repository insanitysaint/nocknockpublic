import { getDb } from './db.js'
import { readSession } from './session.js'
import { ensureWorkspace, orgsOf } from './tenancy.js'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

// Who is calling, and which workspace they act in. Membership is re-read on every call; the cookie only carries the email.
// A signed-in person with no workspace gets one of their own, so nothing waits on team setup.
export async function context(request: Request, orgWanted: string | null) {
  const session = readSession(request)
  if (!session) return { res: json({ error: 'unauthenticated' }, 401) }
  if (request.headers.get('x-requested-with') !== 'ea') return { res: json({ error: 'bad request' }, 400) }
  const db = getDb()
  if (!db) return { res: json({ error: 'Saving is not connected yet: the site needs its database added.' }, 503) }
  const { user } = await ensureWorkspace(db, { email: session.email, name: session.name })
  const userId = user.id
  const orgs = await orgsOf(db, userId)
  const org = orgs.find((o) => o.id === orgWanted) ?? orgs[0]
  return { db, session, userId, orgs, org }
}
