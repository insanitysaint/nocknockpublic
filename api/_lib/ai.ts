import { AI, currentFetch, getKey } from './integrations.js'
import { TenancyError, check, type Db, type Scope } from './tenancy.js'

// One prompt, one answer, using the company's own stored AI key. Used by the persona step.

type AiProvider = (typeof AI)[number]
interface Spec {
  model: string
  call: (k: string, model: string, system: string, user: string) => [string, RequestInit]
  read: (j: any) => string
}

const json = (headers: Record<string, string>, body: unknown): RequestInit => ({
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
})

const SPECS: Record<AiProvider, Spec> = {
  anthropic: {
    model: 'claude-haiku-5-5',
    call: (k, model, system, user) => ['https://api.anthropic.com/v1/messages',
      json({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }, { model, max_tokens: 1200, system, messages: [{ role: 'user', content: user }] })],
    read: (j) => String(j?.content?.[0]?.text ?? ''),
  },
  openai: {
    model: 'gpt-4o-mini',
    call: (k, model, system, user) => ['https://api.openai.com/v1/chat/completions',
      json({ authorization: `Bearer ${k}` }, { model, max_tokens: 1200, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })],
    read: (j) => String(j?.choices?.[0]?.message?.content ?? ''),
  },
  gemini: {
    model: 'gemini-2.0-flash',
    call: (k, model, system, user) => [`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      json({ 'x-goog-api-key': k }, { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }] })],
    read: (j) => String(j?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''),
  },
  deepseek: {
    model: 'deepseek-chat',
    call: (k, model, system, user) => ['https://api.deepseek.com/chat/completions',
      json({ authorization: `Bearer ${k}` }, { model, max_tokens: 1200, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })],
    read: (j) => String(j?.choices?.[0]?.message?.content ?? ''),
  },
}

// The AI providers this company has a stored key for, in the order we prefer them.
export async function aiProviders(db: Db, scope: Scope): Promise<AiProvider[]> {
  check(scope, 'read')
  const r = await db.query<{ provider: string }>(`select provider from integrations where org_id = $1`, [scope.orgId])
  const have = new Set(r.rows.map((x) => x.provider))
  return AI.filter((p) => have.has(p))
}

export async function askAi(db: Db, scope: Scope, system: string, user: string): Promise<string> {
  const [provider] = await aiProviders(db, scope)
  if (!provider) throw new TenancyError('not_found', 'Add an AI key first')
  const key = await getKey(db, scope, provider)
  const spec = SPECS[provider]
  const [url, init] = spec.call(key, spec.model, system, user)
  let res: Response
  try {
    res = await currentFetch()(url, { ...init, signal: AbortSignal.timeout(50_000) })
  } catch {
    throw new TenancyError('invalid', 'The AI provider did not answer. Try again.')
  }
  if (!res.ok) throw new TenancyError('invalid', res.status === 401 || res.status === 403 ? 'The AI provider rejected your key.' : 'The AI provider returned an error. Try again.')
  const text = spec.read(await res.json().catch(() => null)).trim()
  if (!text) throw new TenancyError('invalid', 'The AI provider returned nothing. Try again.')
  return text
}
