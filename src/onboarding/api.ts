import { getOrg } from '../lib/org'

export type Provider = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'apify' | 'firecrawl' | 'apollo'
export type BusinessType = 'solo' | 'agency' | 'startup'

export interface Status { provider: Provider; connected: boolean; last4?: string }
export interface Persona { mode: 'ai' | 'manual'; business: string; target: string; offer: string; persona: string }
export interface KeyResult { provider: string; status: 'connected' | 'unverified' | 'rejected' | 'invalid' | 'error'; message?: string }
export interface Onboarding {
  role: 'owner' | 'manager' | 'viewer'
  business_type: BusinessType | null
  seats: { limit: number; members: number; pending: number; free: number }
  progress: { step: number; done: boolean; skipped: string[] }
  persona: Persona | null
  integrations: Status[]
  ai_ready: boolean
  results?: KeyResult[]
}
export interface AuthConfig { captcha: boolean; site_key: string | null; signup: boolean; google: boolean; zoho: boolean }
export interface Candidate { email: string; company: string; source: string }

export class ApiFail extends Error {
  constructor(message: string, readonly code?: string) { super(message) }
}

export async function call<T>(path: string, body?: object): Promise<T> {
  const org = getOrg()
  let r: Response
  try {
    r = await fetch(!body && org ? `${path}?org=${encodeURIComponent(org)}` : path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-requested-with': 'ea', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(path.startsWith('/api/auth') ? body : { ...body, org }) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new ApiFail('Cannot reach the server.')
  }
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; code?: string }
  if (!r.ok) throw new ApiFail(j.error || 'Something went wrong.', j.code)
  return j
}

export const PROVIDERS: { id: Provider; label: string; hint: string; group: 'ai' | 'source' }[] = [
  { id: 'anthropic', label: 'Claude (Anthropic)', hint: 'console.anthropic.com → API keys', group: 'ai' },
  { id: 'openai', label: 'ChatGPT / Codex (OpenAI)', hint: 'platform.openai.com → API keys', group: 'ai' },
  { id: 'gemini', label: 'Gemini (Google)', hint: 'aistudio.google.com → Get API key', group: 'ai' },
  { id: 'deepseek', label: 'DeepSeek', hint: 'platform.deepseek.com → API keys', group: 'ai' },
  { id: 'firecrawl', label: 'Firecrawl', hint: 'firecrawl.dev → API keys', group: 'source' },
  { id: 'apify', label: 'Apify', hint: 'console.apify.com → Integrations', group: 'source' },
  { id: 'apollo', label: 'Apollo', hint: 'Apollo → Settings → API', group: 'source' },
]

// ---- CSV: pick the email and company columns by header, falling back to the column that holds addresses.
export function parseLeadsCsv(text: string): { email: string; company: string }[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (!lines.length) return []
  const delim = [',', '\t', ';'].map((d) => [d, lines[0].split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const split = (line: string) => {
    const out: string[] = []
    let cur = '', q = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
      else if (c === '"') q = true
      else if (c === delim) { out.push(cur); cur = '' }
      else cur += c
    }
    out.push(cur)
    return out.map((s) => s.trim())
  }
  const rows = lines.map(split)
  const head = rows[0].map((h) => h.toLowerCase())
  let e = head.findIndex((h) => /e-?mail/.test(h))
  const hasHeader = e >= 0 || !rows[0].some((c) => c.includes('@'))
  const body = hasHeader ? rows.slice(1) : rows
  if (e < 0) e = Math.max(0, (body[0] ?? []).findIndex((c) => c.includes('@')))
  const c = hasHeader ? head.findIndex((h) => /company|organi[sz]ation|business|account/.test(h)) : -1
  return body.map((r) => ({ email: (r[e] ?? '').toLowerCase(), company: c >= 0 ? r[c] ?? '' : '' })).filter((r) => r.email.includes('@'))
}
