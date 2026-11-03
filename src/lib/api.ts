import type { CkDoc, CkState, DashState, SendBody } from './types'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

export class ApiError extends Error {}

// Every call carries this header so the Vercel proxy can tell the app from a cross-site page.
const APP_HEADER = { 'x-requested-with': 'ea' }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(BASE + path, { cache: 'no-store', ...init, headers: { ...APP_HEADER, ...(init?.headers as Record<string, string> | undefined) } })
  } catch {
    throw new ApiError('Cannot reach the n8n engine. Is it running?')
  }
  if (res.status === 401) {
    throw new ApiError('Not signed in')
  }
  if (!res.ok) throw new ApiError(`n8n answered ${res.status} for ${path}`)
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError(`n8n returned something that is not JSON for ${path}. Is the workflow active?`)
  }
}

const post = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

export const api = {
  state: () => request<DashState>('/webhook/dash-state'),
  ck: () => request<{ ok: boolean } & CkState>('/webhook/ck-get'),

  /** Cockpit document operations (notes, campaigns, assignments, settings…). Returns the new document. */
  async op(body: Record<string, unknown>): Promise<CkDoc> {
    const j = await post<{ ok: boolean; error?: string; doc: CkDoc }>('/webhook/ck-op', body)
    if (!j.ok) throw new ApiError(j.error || 'Save failed')
    return j.doc
  },

  async upload(source: string, text: string): Promise<void> {
    const res = await fetch(BASE + '/webhook/ck-upload', {
      method: 'POST',
      headers: { ...APP_HEADER, 'content-type': 'application/json' },
      body: JSON.stringify({ source, text }),
    })
    if (!res.ok) throw new ApiError(`Upload failed (${res.status})`)
  },

  /** Approve / reject / undo a lead, or bulk-approve by minimum score. n8n answers with a redirect, so we ignore the body. */
  async decide(params: Record<string, string>): Promise<void> {
    const qs = new URLSearchParams(params).toString()
    try {
      await fetch(`${BASE}/webhook/lead-decide?${qs}`, { cache: 'no-store', redirect: 'manual', headers: APP_HEADER })
    } catch {
      throw new ApiError('Could not reach the engine')
    }
  },

  async send(body: SendBody): Promise<void> {
    await post('/webhook/ck-send', body)
  },

  async fix(body: { id: string; action: 'invalid' | 'requeue'; email: string }): Promise<void> {
    const j = await post<{ ok: boolean; error?: string }>('/webhook/ck-fix', body)
    if (!j.ok) throw new ApiError(j.error || 'Could not save')
  },

  async testMailbox(): Promise<{ ok: boolean; error?: string }> {
    return post('/webhook/ck-test', {})
  },
}
