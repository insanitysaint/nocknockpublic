import { context } from './_lib/ctx.js'
import { getOnboarding, savePersona, saveKeys, saveProgress, setBusinessType } from './_lib/onboarding.js'
import { TenancyError, scopeFor } from './_lib/tenancy.js'

// The first-run wizard for the signed-in person's company: where they are, business type, keys in one go, persona.
// Lead import and scraping reuse /api/integrations ('import', 'find') so there is one code path for them.

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
const STATUS: Record<string, number> = { forbidden: 403, org_paused: 403, not_found: 404, seat_limit: 409 }

const fail = (e: unknown) => {
  if (e instanceof TenancyError) return json({ error: e.message === e.code ? e.code : e.message, code: e.code }, STATUS[e.code] ?? 400)
  console.error('onboarding', e)
  return json({ error: 'Something went wrong.' }, 500)
}

export async function GET(request: Request): Promise<Response> {
  const c = await context(request, new URL(request.url).searchParams.get('org'))
  if ('res' in c && c.res) return c.res
  const { db, userId, org } = c as Exclude<typeof c, { res: Response }>
  if (!db || !userId || !org) return json({ error: 'forbidden' }, 403)
  try { return json(await getOnboarding(db, await scopeFor(db, userId, org.id))) } catch (e) { return fail(e) }
}

export async function POST(request: Request): Promise<Response> {
  let b: Record<string, any>
  try { b = (await request.json()) as Record<string, any> } catch { return json({ error: 'Bad request' }, 400) }
  const c = await context(request, typeof b.org === 'string' ? b.org : null)
  if ('res' in c && c.res) return c.res
  const { db, userId, org } = c as Exclude<typeof c, { res: Response }>
  if (!db || !userId || !org) return json({ error: 'forbidden' }, 403)
  try {
    const scope = await scopeFor(db, userId, org.id)
    switch (b.action) {
      case 'business': await setBusinessType(db, scope, b.type); break
      case 'progress': await saveProgress(db, scope, b); break
      case 'keys': {
        const results = await saveKeys(db, scope, b.keys && typeof b.keys === 'object' ? b.keys : {})
        return json({ results, ...(await getOnboarding(db, scope)) })
      }
      case 'persona': await savePersona(db, scope, b); break
      default: return json({ error: 'Unknown action' }, 400)
    }
    return json(await getOnboarding(db, scope))
  } catch (e) { return fail(e) }
}
