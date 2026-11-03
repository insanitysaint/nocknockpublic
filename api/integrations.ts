import { context } from './_lib/ctx.js'
import {
  SOURCES, findLeads, importCandidates, isProvider, listIntegrations, removeKey, revealApollo, saveKey,
} from './_lib/integrations.js'
import { TenancyError, scopeFor } from './_lib/tenancy.js'

// AI keys and lead-source keys for the signed-in person's company, plus finding leads with them.

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
const STATUS: Record<string, number> = { forbidden: 403, org_paused: 403, not_found: 404, seat_limit: 409 }

const fail = (e: unknown) => {
  if (e instanceof TenancyError) return json({ error: e.message === e.code ? e.code : e.message, code: e.code }, STATUS[e.code] ?? 400)
  console.error('integrations', e)
  return json({ error: 'Something went wrong.' }, 500)
}

export async function GET(request: Request): Promise<Response> {
  const c = await context(request, new URL(request.url).searchParams.get('org'))
  if ('res' in c && c.res) return c.res
  const { db, userId, org } = c as Exclude<typeof c, { res: Response }>
  if (!db || !userId || !org) return json({ role: null, integrations: [] })
  try {
    const scope = await scopeFor(db, userId, org.id)
    return json({ role: scope.role, org: org.name, integrations: await listIntegrations(db, scope) })
  } catch (e) { return fail(e) }
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
      case 'save': {
        if (!isProvider(b.provider)) return json({ error: 'Unknown provider' }, 400)
        const { verified } = await saveKey(db, scope, b.provider, String(b.key ?? ''))
        return json({ ok: true, verified, integrations: await listIntegrations(db, scope) })
      }
      case 'remove': {
        if (!isProvider(b.provider)) return json({ error: 'Unknown provider' }, 400)
        await removeKey(db, scope, b.provider)
        return json({ ok: true, integrations: await listIntegrations(db, scope) })
      }
      case 'find': {
        if (!SOURCES.includes(b.source)) return json({ error: 'Unknown source' }, 400)
        return json(await findLeads(db, scope, b as Parameters<typeof findLeads>[2]))
      }
      case 'reveal': return json({ candidates: await revealApollo(db, scope, Array.isArray(b.ids) ? b.ids.map(String) : []) })
      case 'import': return json(await importCandidates(db, scope, Array.isArray(b.rows) ? b.rows : []))
      default: return json({ error: 'Unknown action' }, 400)
    }
  } catch (e) { return fail(e) }
}
