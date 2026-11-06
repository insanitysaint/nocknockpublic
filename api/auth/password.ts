import { checkLogin } from '../_lib/accounts.js'
import { getDb } from '../_lib/db.js'
import { DUMMY_HASH, passwordUsers, verifyPassword } from '../_lib/password.js'
import { createSession, sessionCookie } from '../_lib/session.js'
import { captchaGate } from '../_lib/turnstile.js'

// Best-effort brake on guessing: 8 failures per IP per 15 minutes. State lives in one server instance's memory,
// so it slows a script down but is not a hard lock. The passwords are long and salted, which is what really protects them.
const attempts = new Map<string, { count: number; reset: number }>()
const MAX_FAILS = 8
const WINDOW_MS = 15 * 60_000

const json = (body: unknown, status: number, extra: HeadersInit = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extra } })

// Two kinds of login share this door:
//   an operator ID from AUTH_USERS (provider 'password': sees the cockpit), and
//   an email + password account made in the sign-up wizard (provider 'local': a customer, never an operator).
export async function POST(request: Request): Promise<Response> {
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  const now = Date.now()
  const rec = attempts.get(ip)
  if (rec && rec.reset > now && rec.count >= MAX_FAILS) return json({ error: 'Too many attempts. Try again in a few minutes.' }, 429)
  if (!captchaGate(request)) return json({ error: 'Please complete the robot check first.', code: 'captcha' }, 403)

  let id = ''
  let password = ''
  try {
    const b = (await request.json()) as { id?: unknown; password?: unknown }
    id = String(b.id ?? '').trim().toLowerCase()
    password = String(b.password ?? '')
  } catch {
    return json({ error: 'Bad request' }, 400)
  }
  if (!id || !password || password.length > 200) return json({ error: 'Enter your ID and password.' }, 400)

  const user = passwordUsers().find((u) => u.id.toLowerCase() === id)
  let ok = verifyPassword(password, user ? user.hash : DUMMY_HASH) && !!user
  let session = ok ? createSession({ email: user!.email.toLowerCase(), name: user!.name, picture: '', provider: 'password' }) : ''

  if (!ok && id.includes('@')) {
    const db = getDb()
    if (db) {
      try {
        const u = await checkLogin(db, id, password)
        if (u) { ok = true; session = createSession({ email: u.email, name: u.name, picture: '', provider: 'local' }) }
      } catch (e) {
        console.error('local login failed', e)
      }
    }
  }

  if (!ok) {
    const fresh = rec && rec.reset > now ? rec : { count: 0, reset: now + WINDOW_MS }
    fresh.count++
    attempts.set(ip, fresh)
    await new Promise((r) => setTimeout(r, 400))
    return json({ error: 'Wrong ID or password.' }, 401)
  }

  attempts.delete(ip)
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(session) })
}
