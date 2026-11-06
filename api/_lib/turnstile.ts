import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookie, getCookie } from './session.js'

// Cloudflare Turnstile ("I am not a robot"). The browser solves the widget, the server checks the token with Cloudflare,
// and a short-lived signed cookie then proves the check passed. Sign-in, sign-up and the Google/Zoho redirects all require it.
// For local work use Cloudflare's published test keys (site 1x00000000000000000000AA, secret 1x0000000000000000000000000000000AA).

export const CAPTCHA_COOKIE = 'ea_captcha'
const TTL_MS = 10 * 60_000

type Fetch = typeof fetch
let doFetch: Fetch = (...a) => fetch(...a)
export const setCaptchaFetch = (f: Fetch | undefined) => { doFetch = f ?? ((...a) => fetch(...a)) }

export const captchaConfigured = () => !!process.env.TURNSTILE_SECRET && !!process.env.TURNSTILE_SITE_KEY

function key(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)')
  return s
}
const sign = (body: string) => createHmac('sha256', key()).update(`captcha.${body}`).digest('base64url')

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET
  if (!secret || !token || token.length > 4096) return false
  try {
    const body = new URLSearchParams({ secret, response: token })
    if (ip && ip !== 'unknown') body.set('remoteip', ip)
    const r = await doFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(10_000),
    })
    const j = (await r.json()) as { success?: boolean }
    return j.success === true
  } catch {
    return false
  }
}

export function captchaCookie(now = Date.now()): string {
  const body = Buffer.from(String(now + TTL_MS)).toString('base64url')
  return cookie(CAPTCHA_COOKIE, `${body}.${sign(body)}`, TTL_MS / 1000)
}

// True when the request carries a valid, unexpired proof of a passed check.
export function captchaPassed(request: Request, now = Date.now()): boolean {
  const raw = getCookie(request, CAPTCHA_COOKIE)
  if (!raw) return false
  const [body, sig] = raw.split('.')
  if (!body || !sig) return false
  const a = Buffer.from(sign(body)), b = Buffer.from(sig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false
  return Number(Buffer.from(body, 'base64url').toString()) > now
}

// Sign-in gate: once Turnstile is configured the proof is mandatory. An install that has not set it up yet keeps working as before
// (operator logins only); open sign-up refuses to run without it.
export function captchaGate(request: Request): boolean {
  return captchaConfigured() ? captchaPassed(request) : true
}
