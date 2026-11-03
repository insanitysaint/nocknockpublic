// Usage:  node scripts/hash-password.mjs <id> "<display name>" <email> [password]
// Prints one AUTH_USERS entry. With no password given, a strong random one is generated and printed once.
import { randomBytes, scryptSync } from 'node:crypto'

const [id, name, email, given] = process.argv.slice(2)
if (!id || !name || !email) {
  console.error('Usage: node scripts/hash-password.mjs <id> "<display name>" <email> [password]')
  process.exit(1)
}
const password = given || randomBytes(15).toString('base64url')
const salt = randomBytes(16)
const hash = `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 32).toString('hex')}`
if (!given) console.error(`Generated password for ${id}: ${password}`)
console.log(JSON.stringify({ id, name, email, hash }))
