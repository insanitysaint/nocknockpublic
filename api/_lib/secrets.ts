import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

// Encrypts stored API keys (AES-256-GCM). INTEGRATIONS_KEY is the master secret; keep it only in the host's env settings.
// Losing or changing it makes stored keys unreadable, and people simply paste them in again.

function key(): Buffer {
  const k = process.env.INTEGRATIONS_KEY
  if (!k || k.length < 32) throw new Error('INTEGRATIONS_KEY must be set (32+ characters)')
  return createHash('sha256').update(k).digest()
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

export function decrypt(blob: string): string {
  const [v, iv, tag, body] = blob.split('.')
  if (v !== 'v1' || !iv || !tag || !body) throw new Error('unreadable secret')
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(body, 'base64url')), d.final()]).toString('utf8')
}
