import { createAccount } from '../_lib/accounts.js'
import { signupOpen } from '../_lib/access.js'
import { getDb } from '../_lib/db.js'
import { createSession, sessionCookie } from '../_lib/session.js'
import { TenancyError } from '../_lib/tenancy.js'
import { captchaConfigured, captchaPassed } from '../_lib/turnstile.js'

// Sign up with an email and a password. Needs the robot check (Cloudflare Turnstile) and SIGNUP=open on the host.
// 5 sign-ups per IP per hour, best effort (memory of one server instance).
const made = new Map<string, { count: number; reset: number }>()

const json = (body: unknown, status: number, extra: HeadersInit = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extra } })

export async function POST(request: Request): Promise<Response> {
  if (!signupOpen()) return json({ error: 'Sign-up is closed on this site.' }, 403)
  if (!captchaConfigured()) return json({ error: 'Sign-up needs the robot check, which is not set up on this site yet.' }, 503)
  if (!captchaPassed(request)) return json({ error: 'Please complete the robot check first.', code: 'captcha' }, 403)
  const db = getDb()
  if (!db) return json({ error: 'Saving is not connected yet: the site needs its database added.' }, 503)

  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  const now = Date.now()
  const rec = made.get(ip)
  if (rec && rec.reset > now && rec.count >= 5) return json({ error: 'Too many sign-ups from here. Try again later.' }, 429)

  let b: { email?: unknown; name?: unknown; password?: unknown }
  try { b = (await request.json()) as typeof b } catch { return json({ error: 'Bad request' }, 400) }
  try {
    const u = await createAccount(db, { email: String(b.email ?? ''), name: String(b.name ?? ''), password: String(b.password ?? '') })
    const fresh = rec && rec.reset > now ? rec : { count: 0, reset: now + 3_600_000 }
    fresh.count++
    made.set(ip, fresh)
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(createSession({ email: u.email, name: u.name, picture: '', provider: 'local' })) })
  } catch (e) {
    if (e instanceof TenancyError) return json({ error: e.message === e.code ? e.code : e.message, code: e.code }, e.code === 'already_member' ? 409 : 400)
    console.error('signup', e)
    return json({ error: 'Something went wrong.' }, 500)
  }
}
