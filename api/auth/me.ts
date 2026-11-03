import { engineAccess } from '../_lib/access.js'
import { readSession } from '../_lib/session.js'

export async function GET(request: Request): Promise<Response> {
  const s = readSession(request)
  if (!s) return Response.json({ error: 'unauthenticated' }, { status: 401, headers: { 'cache-control': 'no-store' } })
  const access = await engineAccess(s)
  // `operator` means "gets the cockpit" (the dashboard). `access` says how much: full, manager or viewer.
  return Response.json(
    { email: s.email, name: s.name, picture: s.picture, provider: s.provider, operator: access !== null, access },
    { headers: { 'cache-control': 'no-store' } },
  )
}
