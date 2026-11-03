import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// Stored format: scrypt$<salt hex>$<hash hex>. Make one with: node scripts/hash-password.mjs
const KEYLEN = 32

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, KEYLEN).toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(actual, expected)
}

export interface PasswordUser {
  id: string
  name: string
  email: string
  hash: string
}

/** AUTH_USERS is a JSON array: [{"id":"saurav","name":"Saurav","email":"you@x.com","hash":"scrypt$..."}] */
export function passwordUsers(): PasswordUser[] {
  try {
    const list = JSON.parse(process.env.AUTH_USERS || '[]') as PasswordUser[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

// A real-looking hash to compare against when the ID does not exist, so "unknown ID" and "wrong password" take the same time.
export const DUMMY_HASH = `scrypt$${'00'.repeat(16)}$${'00'.repeat(KEYLEN)}`
