import { STATE_COOKIE, cookie, failRedirect, newState, origin } from '../_lib/session.js'
import { captchaGate } from '../_lib/turnstile.js'

// Zoho, step 1: send the browser to Zoho's consent screen. ZOHO_ACCOUNTS_URL picks your data centre
// (https://accounts.zoho.in for India, https://accounts.zoho.com for the US, and so on).
export function GET(request: Request): Response {
  if (!captchaGate(request)) return failRedirect(request, 'captcha', false)
  const clientId = process.env.ZOHO_CLIENT_ID
  if (!clientId) return new Response('ZOHO_CLIENT_ID is not configured', { status: 500 })

  const state = newState()
  const accounts = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, '')
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin(request)}/api/auth/zoho-callback`,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    state,
  })
  return new Response(null, {
    status: 302,
    headers: [
      ['Location', `${accounts}/oauth/v2/auth?${params}`],
      ['Set-Cookie', cookie(STATE_COOKIE, state, 600)],
    ],
  })
}
