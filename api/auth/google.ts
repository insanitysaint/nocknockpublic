import { STATE_COOKIE, cookie, newState, origin } from '../_lib/session.js'

// Step 1: send the browser to Google's consent screen.
export function GET(request: Request): Response {
  const clientId = process.env.GOOGLE_CLIENT_ID
  if (!clientId) return new Response('GOOGLE_CLIENT_ID is not configured', { status: 500 })

  const state = newState()
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin(request)}/api/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  })
  return new Response(null, {
    status: 302,
    headers: [
      ['Location', `https://accounts.google.com/o/oauth2/v2/auth?${params}`],
      ['Set-Cookie', cookie(STATE_COOKIE, state, 600)],
    ],
  })
}
