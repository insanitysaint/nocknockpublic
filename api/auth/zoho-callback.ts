import { admit } from '../_lib/access.js'
import { STATE_COOKIE, failRedirect, getCookie, loginRedirect, origin } from '../_lib/session.js'

// Only talk to real Zoho account servers, even if the redirect carries an "accounts-server" hint.
const ZOHO_HOST = /^https:\/\/accounts\.zoho\.(com|in|eu|com\.au|jp|com\.cn|sa|ca)$/

interface Claims {
  iss?: string
  aud?: string | string[]
  exp?: number
  email?: string
  name?: string
  first_name?: string
  last_name?: string
}

// Zoho, step 2: swap the code for the user's identity, check the allow-list, set a session.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (url.searchParams.get('error') || !code) return failRedirect(request, 'cancelled')
  if (!state || state !== getCookie(request, STATE_COOKIE)) return failRedirect(request, 'state')

  const hint = (url.searchParams.get('accounts-server') || '').replace(/\/$/, '')
  const accounts = ZOHO_HOST.test(hint) ? hint : (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in').replace(/\/$/, '')
  if (!ZOHO_HOST.test(accounts)) return failRedirect(request, 'token')

  const res = await fetch(`${accounts}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.ZOHO_CLIENT_ID || '',
      client_secret: process.env.ZOHO_CLIENT_SECRET || '',
      redirect_uri: `${origin(request)}/api/auth/zoho-callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) return failRedirect(request, 'token')
  const tokens = (await res.json()) as { id_token?: string; access_token?: string; error?: string }
  if (tokens.error) return failRedirect(request, 'token')

  // The id_token came straight from Zoho over TLS. Decode it and check the claims.
  let claims: Claims = {}
  if (tokens.id_token) {
    try {
      claims = JSON.parse(Buffer.from(tokens.id_token.split('.')[1], 'base64url').toString()) as Claims
    } catch {
      return failRedirect(request, 'token')
    }
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (!aud.includes(process.env.ZOHO_CLIENT_ID) || !claims.iss?.startsWith('https://accounts.zoho.') || (claims.exp ?? 0) * 1000 < Date.now()) {
      return failRedirect(request, 'token')
    }
  }

  let email = claims.email
  let name = claims.name || [claims.first_name, claims.last_name].filter(Boolean).join(' ')
  if (!email && tokens.access_token) {
    // Fall back to Zoho's user-info endpoint when the id_token has no email.
    const info = await fetch(`${accounts}/oauth/user/info`, { headers: { Authorization: `Zoho-oauthtoken ${tokens.access_token}` } })
    if (info.ok) {
      const j = (await info.json()) as { Email?: string; Display_Name?: string }
      email = j.Email
      name = name || j.Display_Name || ''
    }
  }
  if (!email) return failRedirect(request, 'unverified')
  if (!(await admit(email, name || ''))) return failRedirect(request, 'denied')

  return loginRedirect(request, { email, name: name || email, provider: 'zoho' })
}
