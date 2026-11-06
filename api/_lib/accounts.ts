import { DUMMY_HASH, hashPassword, verifyPassword } from './password.js'
import { TenancyError, ensureWorkspace, normEmail, type Db, type User } from './tenancy.js'

// Accounts that sign up with an email and a password. The email is NOT verified here, so such an account may never
// take over anything tied to that address: it cannot accept invites, and it can only be created for an address with no account yet.
// When the real owner of the address signs in with Google or Zoho (a verified email), clearUnverifiedPassword() removes the password.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MIN_PASSWORD = 10

export async function createAccount(db: Db, p: { email: string; name: string; password: string }): Promise<User> {
  const email = normEmail(p.email)
  if (!EMAIL.test(email) || email.length > 254) throw new TenancyError('invalid', 'Enter a valid email address')
  if (p.password.length < MIN_PASSWORD) throw new TenancyError('invalid', `Use a password of at least ${MIN_PASSWORD} characters`)
  if (p.password.length > 200) throw new TenancyError('invalid', 'That password is too long')
  const name = p.name.trim().slice(0, 80)
  const hash = hashPassword(p.password)
  const r = await db.query<User>(
    `insert into users (email, name, password_hash) values ($1, $2, $3)
     on conflict (email) do nothing returning id, email, name`, [email, name, hash])
  // An address that already has an account (password, Google, Zoho, or an invite target) is never claimed with a password.
  if (!r.rows.length) throw new TenancyError('already_member', 'An account with this email already exists. Sign in instead.')
  await ensureWorkspace(db, { email, name })
  return r.rows[0]
}

// Same time whether the email exists or not.
export async function checkLogin(db: Db, emailIn: string, password: string): Promise<User | null> {
  const email = normEmail(emailIn)
  const r = await db.query<User & { password_hash: string | null }>(
    `select id, email, name, password_hash from users where email = $1`, [email])
  const row = r.rows[0]
  const ok = verifyPassword(password, row?.password_hash || DUMMY_HASH) && !!row?.password_hash
  return ok ? { id: row.id, email: row.email, name: row.name } : null
}

export async function clearUnverifiedPassword(db: Db, emailIn: string): Promise<void> {
  await db.query(`update users set password_hash = null where email = $1 and password_hash is not null`, [normEmail(emailIn)])
}
