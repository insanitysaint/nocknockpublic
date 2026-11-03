import { useCallback, useEffect, useState } from 'react'
import Nav from '../components/Nav'
import { getOrg } from '../lib/org'

type Provider = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'apify' | 'firecrawl' | 'apollo'
interface Status { provider: Provider; connected: boolean; last4?: string; updated_at?: string }
interface State { role: string | null; org?: string; integrations: Status[] }
interface Candidate { email: string; company: string; name?: string; title?: string; source: string; apollo_id?: string }

const AI: [Provider, string, string][] = [
  ['anthropic', 'Claude (Anthropic)', 'console.anthropic.com → API keys'],
  ['openai', 'ChatGPT (OpenAI)', 'platform.openai.com → API keys'],
  ['gemini', 'Gemini (Google)', 'aistudio.google.com → Get API key'],
  ['deepseek', 'DeepSeek', 'platform.deepseek.com → API keys'],
]
const SOURCES: [Provider, string, string][] = [
  ['firecrawl', 'Firecrawl', 'Reads web pages and returns the emails on them. firecrawl.dev → API keys'],
  ['apify', 'Apify', 'Runs a scraper (an "actor") of your choice. console.apify.com → Integrations'],
  ['apollo', 'Apollo', 'Finds people by company domain and job title. Revealing emails uses Apollo credits'],
]

async function api<T>(path: string, body?: object): Promise<T> {
  const org = getOrg()
  const r = await fetch(!body && org ? `${path}?org=${encodeURIComponent(org)}` : path, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-requested-with': 'ea', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify({ ...body, org }) : undefined,
    cache: 'no-store',
  })
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || 'Something went wrong.')
  return j
}

function useIntegrations() {
  const [s, setS] = useState<State | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { api<State>('/api/integrations').then(setS).catch((e: Error) => setError(e.message)) }, [])
  const act = useCallback(async (body: object) => {
    setError(''); setNotice('')
    try {
      const j = await api<{ integrations: Status[]; verified?: boolean }>('/api/integrations', body)
      setS((p) => (p ? { ...p, integrations: j.integrations } : p))
      if (j.verified === false) setNotice('Saved, but the provider could not confirm the key right now.')
      return true
    } catch (e) { setError((e as Error).message); return false }
  }, [])
  return { s, error, setError, notice, act }
}

function KeyCard({ p, label, hint, st, owner, act }: { p: Provider; label: string; hint: string; st?: Status; owner: boolean; act: (b: object) => Promise<boolean> }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <section className="panel" style={{ marginBottom: 12 }}>
      <div className="ph">
        <h2>{label}</h2>
        <span className="sub">{st?.connected ? `Connected, key ending ${st.last4}` : 'Not connected'}</span>
      </div>
      <div style={{ padding: 12 }}>
        <p className="sub" style={{ margin: '0 0 8px' }}>{hint}</p>
        {owner ? (
          <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} onSubmit={async (e) => {
            e.preventDefault(); setBusy(true)
            if (await act({ action: 'save', provider: p, key })) setKey('')
            setBusy(false)
          }}>
            <input className="input" type="password" autoComplete="off" spellCheck={false} placeholder={st?.connected ? 'Paste a new key to replace it' : 'Paste your API key'}
              aria-label={`${label} API key`} value={key} onChange={(e) => setKey(e.target.value)} style={{ flex: '1 1 260px' }} />
            <button className="btn" disabled={busy || key.trim().length < 8}>{busy ? 'Checking…' : st?.connected ? 'Replace' : 'Connect'}</button>
            {st?.connected && <button type="button" className="btn ghost" disabled={busy} onClick={() => { if (confirm(`Remove the ${label} key?`)) void act({ action: 'remove', provider: p }) }}>Remove</button>}
          </form>
        ) : <p className="sub" style={{ margin: 0 }}>Only an owner can add or remove keys.</p>}
      </div>
    </section>
  )
}

function Frame({ view, title, children, s, error, notice }: { view: 'ai' | 'sources'; title: string; children: React.ReactNode; s: State | null; error: string; notice: string }) {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '32px 16px' }}>
      <Nav view={view} title={s?.org} />
      <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>{title}</h1>
      {error && <div className="banner bad" role="alert">{error}</div>}
      {notice && <div className="banner" role="status">{notice}</div>}
      {children}
    </div>
  )
}

export function AiKeys() {
  const { s, error, notice, act } = useIntegrations()
  return (
    <Frame view="ai" title="AI keys" s={s} error={error} notice={notice}>
      <p className="sub" style={{ marginTop: 0 }}>Connect the AI tools you use. Keys are checked with the provider, stored encrypted, and never shown again.</p>
      {s && AI.map(([p, label, hint]) => <KeyCard key={p} p={p} label={label} hint={hint} st={s.integrations.find((i) => i.provider === p)} owner={s.role === 'owner'} act={act} />)}
    </Frame>
  )
}

export function LeadSources() {
  const { s, error, setError, notice, act } = useIntegrations()
  const connected = (p: Provider) => !!s?.integrations.find((i) => i.provider === p)?.connected
  const canUse = s?.role === 'owner' || s?.role === 'manager'

  const [source, setSource] = useState<'firecrawl' | 'apify' | 'apollo'>('firecrawl')
  const [urls, setUrls] = useState('')
  const [actor, setActor] = useState('')
  const [input, setInput] = useState('{\n  "startUrls": [{ "url": "https://example.com" }]\n}')
  const [domains, setDomains] = useState('')
  const [titles, setTitles] = useState('Founder, Owner, CEO')
  const [busy, setBusy] = useState(false)
  const [cands, setCands] = useState<Candidate[]>([])
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [done, setDone] = useState('')

  const key = (c: Candidate) => c.apollo_id || c.email
  const lines = (t: string) => t.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)

  async function run() {
    setBusy(true); setError(''); setDone(''); setCands([]); setPicked(new Set()); setNote('')
    try {
      let body: object
      if (source === 'firecrawl') body = { action: 'find', source, urls: lines(urls) }
      else if (source === 'apify') body = { action: 'find', source, actor, input: JSON.parse(input || '{}') }
      else body = { action: 'find', source, domains: lines(domains), titles: lines(titles) }
      const j = await api<{ candidates: Candidate[]; note?: string }>('/api/integrations', body)
      setCands(j.candidates); setNote(j.note || (j.candidates.length ? '' : 'No emails found.'))
      setPicked(new Set(j.candidates.filter((c) => !c.email.startsWith('pending:')).map(key)))
    } catch (e) { setError(e instanceof SyntaxError ? 'The actor input is not valid JSON.' : (e as Error).message) }
    setBusy(false)
  }

  async function reveal() {
    const ids = cands.filter((c) => c.email.startsWith('pending:') && picked.has(key(c))).map((c) => c.apollo_id!).slice(0, 10)
    if (!ids.length || !confirm(`Reveal ${ids.length} email(s)? This uses Apollo credits.`)) return
    setBusy(true); setError('')
    try {
      const j = await api<{ candidates: Candidate[] }>('/api/integrations', { action: 'reveal', ids })
      const by = new Map(j.candidates.map((c) => [c.apollo_id, c]))
      setCands((p) => p.map((c) => (c.apollo_id && by.has(c.apollo_id) ? { ...by.get(c.apollo_id)!, name: c.name, title: c.title } : c)))
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  async function add() {
    const rows = cands.filter((c) => picked.has(key(c)) && !c.email.startsWith('pending:')).map((c) => ({ email: c.email, company: c.company }))
    if (!rows.length) return
    setBusy(true); setError('')
    try {
      const r = await api<{ added: number; duplicates: number; suppressed: number; invalid: number }>('/api/integrations', { action: 'import', rows })
      setDone(`Added ${r.added} to Review${r.duplicates ? `, ${r.duplicates} already there` : ''}${r.suppressed ? `, ${r.suppressed} on your do-not-contact list` : ''}. Nothing is approved automatically: verify the addresses before approving.`)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  return (
    <Frame view="sources" title="Lead sources" s={s} error={error} notice={notice}>
      <p className="sub" style={{ marginTop: 0 }}>Connect a source, find email addresses, and add the ones you pick to Review.</p>
      {s && SOURCES.map(([p, label, hint]) => <KeyCard key={p} p={p} label={label} hint={hint} st={s.integrations.find((i) => i.provider === p)} owner={s.role === 'owner'} act={act} />)}

      {s && canUse && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="ph"><h2>Find leads</h2><span className="sub">uses your own account with the source</span></div>
          <div style={{ padding: 12, display: 'grid', gap: 10 }}>
            <select className="input" aria-label="Source" value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
              {SOURCES.map(([p, label]) => <option key={p} value={p} disabled={!connected(p)}>{label}{connected(p) ? '' : ' (not connected)'}</option>)}
            </select>
            {source === 'firecrawl' && (
              <textarea className="input" rows={4} placeholder={'One web address per line (up to 5), e.g.\nhttps://company.com/contact'} aria-label="Web addresses" value={urls} onChange={(e) => setUrls(e.target.value)} />
            )}
            {source === 'apify' && (<>
              <input className="input" placeholder="Actor, e.g. vdrmota/contact-info-scraper" aria-label="Actor" value={actor} onChange={(e) => setActor(e.target.value)} />
              <textarea className="input" rows={5} spellCheck={false} aria-label="Actor input (JSON)" value={input} onChange={(e) => setInput(e.target.value)} style={{ fontFamily: 'monospace' }} />
            </>)}
            {source === 'apollo' && (<>
              <input className="input" placeholder="Company domains, comma separated (up to 10)" aria-label="Company domains" value={domains} onChange={(e) => setDomains(e.target.value)} />
              <input className="input" placeholder="Job titles, comma separated" aria-label="Job titles" value={titles} onChange={(e) => setTitles(e.target.value)} />
            </>)}
            <div><button className="btn" disabled={busy || !connected(source)} onClick={() => void run()}>{busy ? 'Working…' : 'Find'}</button></div>
          </div>

          {note && <p className="sub" style={{ padding: '0 12px' }}>{note}</p>}
          {cands.length > 0 && (<>
            <table className="t">
              <thead><tr><th /><th>Email</th><th>Company</th><th>Person</th></tr></thead>
              <tbody>{cands.map((c) => (
                <tr key={key(c)}>
                  <td><input type="checkbox" aria-label={`Select ${c.email}`} checked={picked.has(key(c))} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(key(c)); else n.delete(key(c)); return n })} /></td>
                  <td className="em">{c.email.startsWith('pending:') ? <span className="sub">hidden by Apollo</span> : c.email}</td>
                  <td className="co">{c.company}</td>
                  <td>{[c.name, c.title].filter(Boolean).join(', ')}</td>
                </tr>
              ))}</tbody>
            </table>
            <div style={{ padding: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn" disabled={busy || ![...picked].length} onClick={() => void add()}>Add selected to Review</button>
              {cands.some((c) => c.email.startsWith('pending:')) && <button className="btn ghost" disabled={busy} onClick={() => void reveal()}>Reveal emails (uses Apollo credits)</button>}
            </div>
          </>)}
          {done && <p className="sub" style={{ padding: '0 12px 12px' }}>{done}</p>}
        </section>
      )}
    </Frame>
  )
}
