import { engineAccess } from './_lib/access.js'
import { readSession } from './_lib/session.js'

// The browser only ever talks to this function. It checks you are signed in, then forwards to the n8n engine on the
// Oracle server using a private login the browser never sees. vercel.json rewrites /webhook/* to here.

// Only these engine endpoints can be reached. Everything else on the server stays unreachable from the app.
const ALLOWED = new Set(['dash-state', 'ck-get', 'ck-op', 'ck-upload', 'ck-send', 'ck-fix', 'ck-test', 'lead-decide'])

// A viewer may only call the endpoints that read.
const READ_ONLY = new Set(['dash-state', 'ck-get'])

const json = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

async function handle(request: Request): Promise<Response> {
  const session = readSession(request)
  if (!session) return json({ error: 'unauthenticated' }, 401)
  // The engine holds the owner's own leads. Only operators and members of an operator's workspace reach it, and viewers only read.
  const access = await engineAccess(session)
  if (!access) return json({ error: 'forbidden' }, 403)

  // Some of these endpoints change data on a GET (lead-decide), so every call must carry a header that a
  // cross-site page cannot add. The app sets it on every request.
  if (request.headers.get('x-requested-with') !== 'ea') return json({ error: 'bad request' }, 400)

  const url = new URL(request.url)
  const path = url.searchParams.get('path') || ''
  if (!ALLOWED.has(path)) return json({ error: 'not found' }, 404)
  if (access === 'viewer' && !READ_ONLY.has(path)) return json({ error: 'Viewers can look but not change anything.' }, 403)

  const base = (process.env.N8N_BASE_URL || '').replace(/\/$/, '')
  const user = process.env.N8N_PROXY_USER
  const pass = process.env.N8N_PROXY_PASSWORD
  if (!base || !user || !pass) return json({ error: 'engine connection is not configured' }, 500)

  const forward = new URLSearchParams(url.searchParams)
  forward.delete('path')
  const target = `${base}/webhook/${path}${forward.size ? `?${forward}` : ''}`

  const headers: Record<string, string> = { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` }
  const type = request.headers.get('content-type')
  if (type) headers['content-type'] = type

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
      redirect: 'manual',
      signal: AbortSignal.timeout(55_000),
    })
    // The approve/reject endpoint answers with a redirect to an HTML page. The app only needs to know it worked.
    if (upstream.status >= 300 && upstream.status < 400) return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' },
    })
  } catch {
    return json({ error: 'The engine did not answer' }, 502)
  }
}

export const GET = handle
export const POST = handle
