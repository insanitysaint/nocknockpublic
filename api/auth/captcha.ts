import { captchaConfigured, captchaCookie, verifyTurnstile } from '../_lib/turnstile.js'

const json = (body: unknown, status = 200, extra: HeadersInit = {}) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store', ...extra } })

// What the sign-in page needs to know before it draws: is the check on, and is sign-up open.
export function GET(): Response {
  return json({
    captcha: captchaConfigured(),
    site_key: captchaConfigured() ? process.env.TURNSTILE_SITE_KEY : null,
    signup: process.env.SIGNUP === 'open',
    google: !!process.env.GOOGLE_CLIENT_ID,
    zoho: !!process.env.ZOHO_CLIENT_ID,
  })
}

// The browser posts the Turnstile token; a pass sets a signed 10-minute cookie that sign-in, sign-up and the OAuth redirects require.
export async function POST(request: Request): Promise<Response> {
  if (!captchaConfigured()) return json({ error: 'The robot check is not set up on this site yet.' }, 503)
  let token = ''
  try { token = String(((await request.json()) as { token?: unknown }).token ?? '') } catch { return json({ error: 'Bad request' }, 400) }
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  if (!(await verifyTurnstile(token, ip))) return json({ error: 'The robot check failed. Try again.' }, 400)
  return json({ ok: true }, 200, { 'Set-Cookie': captchaCookie() })
}
