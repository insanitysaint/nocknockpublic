import { SESSION_COOKIE, clearCookie } from '../_lib/session.js'

export function POST(): Response {
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearCookie(SESSION_COOKIE) } })
}
