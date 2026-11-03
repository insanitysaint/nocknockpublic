import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'ea_session'
export const STATE_COOKIE = 'ea_oauth_state'
const SESSION_DAYS = 7

export interface Session {
  email: string
  name: string
  picture: string
  provider: string
  exp: number
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url')

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters)')
  return s
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url')

export function createSession(user: Omit<Session, 'exp'>): string {
  const body = b64u(JSON.stringify({ ...user, exp: Date.now() + SESSION_DAYS * 86_400_000 }))
  return `${body}.${sign(body)}`
}

export function readSession(request: Request): Session | null {
  const raw = getCookie(request, SESSION_COOKIE)
  if (!raw) return null
  const [body, sig] = raw.split('.')
  if (!body || !sig) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session
    return s.exp > Date.now() ? s : null
  } catch {
    return null
  }
}

export function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie') || ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

export function cookie(name: string, value: string, maxAgeSeconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`
}

export const clearCookie = (name: string) => cookie(name, '', 0)
export const sessionCookie = (value: string) => cookie(SESSION_COOKIE, value, SESSION_DAYS * 86_400)
export const newState = () => randomBytes(24).toString('base64url')

export function allowed(email: string): boolean {
  const list = (process.env.ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
  return list.includes(email.toLowerCase())
}

export function origin(request: Request): string {
  const host = (request.headers.get('x-forwarded-host') || request.headers.get('host') || '').toLowerCase()
  // Only hosts we list are trusted as the sign-in address; anything else falls back to APP_URL.
  const known = (process.env.APP_HOSTS || '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  if (host && known.includes(host)) return `https://${host}`
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  return `https://${host}`
}

export type Provider = 'google' | 'zoho' | 'password'

export interface LoginUser {
  email: string
  name: string
  picture?: string
  provider: Provider
}

export function failRedirect(request: Request, reason: string, clearState = true): Response {
  const headers: [string, string][] = [['Location', `${origin(request)}/?error=${reason}`]]
  if (clearState) headers.push(['Set-Cookie', clearCookie(STATE_COOKIE)])
  return new Response(null, { status: 302, headers })
}

export function loginRedirect(request: Request, user: LoginUser): Response {
  const session = createSession({ email: user.email.toLowerCase(), name: user.name, picture: user.picture || '', provider: user.provider })
  return new Response(null, {
    status: 302,
    headers: [
      ['Location', `${origin(request)}/`],
      ['Set-Cookie', sessionCookie(session)],
      ['Set-Cookie', clearCookie(STATE_COOKIE)],
    ],
  })
}
