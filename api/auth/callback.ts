import { admit } from '../_lib/access.js'
import { STATE_COOKIE, failRedirect, getCookie, loginRedirect, origin } from '../_lib/session.js'

// Google, step 2: Google sends the browser back here with ?code. Swap it for the user's identity, check the allow-list, set a session.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (url.searchParams.get('error') || !code) return failRedirect(request, 'cancelled')
  if (!state || state !== getCookie(request, STATE_COOKIE)) return failRedirect(request, 'state')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: `${origin(request)}/api/auth/callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) return failRedirect(request, 'token')

  // The id_token came straight from Google over TLS, so decoding it is enough. We still check the claims.
  const { id_token } = (await res.json()) as { id_token?: string }
  if (!id_token) return failRedirect(request, 'token')
  const claims = JSON.parse(Buffer.from(id_token.split('.')[1], 'base64url').toString()) as {
    iss: string; aud: string; exp: number; email?: string; email_verified?: boolean; name?: string; picture?: string
  }
  const validIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com'
  if (!validIssuer || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now()) return failRedirect(request, 'token')
  if (!claims.email || !claims.email_verified) return failRedirect(request, 'unverified')
  if (!(await admit(claims.email, claims.name || ''))) return failRedirect(request, 'denied')

  return loginRedirect(request, { email: claims.email, name: claims.name || claims.email, picture: claims.picture, provider: 'google' })
}
