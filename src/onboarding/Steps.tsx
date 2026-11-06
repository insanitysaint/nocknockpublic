import { useRef, useState, type ReactNode } from 'react'
import { PROVIDERS, call, parseLeadsCsv, type BusinessType, type Candidate, type KeyResult, type Onboarding, type Persona, type Provider } from './api'

export interface StepProps {
  data: Onboarding
  setData: (d: Onboarding) => void
  next: (skip?: string) => void
  back: () => void
}

const Actions = ({ children }: { children: ReactNode }) => <div className="wz-actions">{children}</div>
const Err = ({ msg }: { msg: string }) => (msg ? <div className="banner bad" role="alert">{msg}</div> : null)

// ---------------------------------------------------------------- 2. business type

const PLANS: { id: BusinessType; title: string; seats: number; blurb: string }[] = [
  { id: 'solo', title: 'Solopreneur', seats: 1, blurb: 'Just you, running your own outreach.' },
  { id: 'agency', title: 'Mid Size Agency', seats: 10, blurb: 'A small team sending for itself or for clients.' },
  { id: 'startup', title: 'Established Startup', seats: 20, blurb: 'A sales team with several people on one account.' },
]

export function BusinessStep({ data, setData, next }: StepProps) {
  const [pick, setPick] = useState<BusinessType | null>(data.business_type)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const owner = data.role === 'owner'
  async function go() {
    if (!pick) return
    setBusy(true); setError('')
    try { setData(await call<Onboarding>('/api/onboarding', { action: 'business', type: pick })); next() }
    catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  return (
    <div>
      <h2>What kind of business are you?</h2>
      <p className="sub">This sets how many people can share your account.</p>
      <Err msg={error} />
      <div className="wz-cards" role="radiogroup" aria-label="Business type">
        {PLANS.map((p) => (
          <button key={p.id} role="radio" aria-checked={pick === p.id} className={'wz-card' + (pick === p.id ? ' on' : '')} onClick={() => setPick(p.id)} disabled={!owner}>
            <span className="wz-card-title">{p.title}</span>
            <span className="wz-seats">{p.seats}<small> seat{p.seats > 1 ? 's' : ''}</small></span>
            <span className="sub">{p.blurb}</span>
          </button>
        ))}
      </div>
      <Actions>
        <button className="btn primary" disabled={!pick || busy || !owner} onClick={() => void go()}>{busy ? 'Saving…' : 'Continue'}</button>
      </Actions>
    </div>
  )
}

// ---------------------------------------------------------------- 3. API keys, all in one go

const CHIP: Record<KeyResult['status'], [string, string]> = {
  connected: ['ok', 'Connected'], unverified: ['warn', 'Saved, could not confirm'], rejected: ['bad', 'Rejected'], invalid: ['bad', 'Not valid'], error: ['bad', 'Try again'],
}

export function KeysStep({ data, setData, next, back }: StepProps) {
  const [vals, setVals] = useState<Partial<Record<Provider, string>>>({})
  const [results, setResults] = useState<KeyResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const owner = data.role === 'owner'
  const typed = Object.entries(vals).filter(([, v]) => (v ?? '').trim())
  const by = Object.fromEntries(results.map((r) => [r.provider, r]))
  async function connect() {
    setBusy(true); setError('')
    try {
      const d = await call<Onboarding>('/api/onboarding', { action: 'keys', keys: Object.fromEntries(typed) })
      setResults(d.results ?? []); setData(d)
      setVals((v) => Object.fromEntries(Object.entries(v).filter(([p]) => d.results?.find((r) => r.provider === p)?.status !== 'connected' && d.results?.find((r) => r.provider === p)?.status !== 'unverified')))
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  const card = (p: (typeof PROVIDERS)[number]) => {
    const st = data.integrations.find((i) => i.provider === p.id)
    const r = by[p.id]
    return (
      <div className="wz-key" key={p.id}>
        <div className="wz-key-head">
          <strong>{p.label}</strong>
          {r ? <span className={'chip ' + CHIP[r.status][0]}>{CHIP[r.status][1]}</span> : st?.connected ? <span className="chip ok">Connected ····{st.last4}</span> : <span className="chip">Not connected</span>}
        </div>
        <input className="input" type="password" autoComplete="off" spellCheck={false} aria-label={`${p.label} API key`} disabled={!owner}
          placeholder={st?.connected ? 'Paste a new key to replace it' : 'Paste API key'} value={vals[p.id] ?? ''} onChange={(e) => setVals({ ...vals, [p.id]: e.target.value })} />
        <span className="hint">{r?.message ?? p.hint}</span>
      </div>
    )
  }
  return (
    <div>
      <h2>Connect your tools</h2>
      <p className="sub">Paste any keys you have, then connect them all at once. Each key is checked with its provider and stored encrypted. You can skip this and add keys later.</p>
      <Err msg={error} />
      <h3 className="wz-h3">AI assistants</h3>
      <div className="wz-keys">{PROVIDERS.filter((p) => p.group === 'ai').map(card)}</div>
      <h3 className="wz-h3">Lead sources</h3>
      <div className="wz-keys">{PROVIDERS.filter((p) => p.group === 'source').map(card)}</div>
      <Actions>
        <button className="btn ghost" onClick={back}>Back</button>
        <span className="grow" />
        <button className="btn ghost" onClick={() => next('keys')}>Skip for now</button>
        <button className="btn" disabled={busy || !typed.length || !owner} onClick={() => void connect()}>{busy ? 'Checking…' : `Connect ${typed.length || ''} key${typed.length === 1 ? '' : 's'}`.replace('  ', ' ')}</button>
        <button className="btn primary" onClick={() => next()} disabled={busy}>Continue</button>
      </Actions>
    </div>
  )
}

// ---------------------------------------------------------------- 4. persona

export function PersonaStep({ data, setData, next, back }: StepProps) {
  const aiReady = data.ai_ready
  const [tab, setTab] = useState<'ai' | 'manual'>(aiReady ? (data.persona?.mode ?? 'ai') : 'manual')
  const [f, setF] = useState({ business: data.persona?.business ?? '', target: data.persona?.target ?? '', offer: data.persona?.offer ?? '', persona: data.persona?.persona ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [made, setMade] = useState<Persona | null>(data.persona?.mode === 'ai' ? data.persona : null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  async function save() {
    setBusy(true); setError('')
    try {
      const d = await call<Onboarding>('/api/onboarding', { action: 'persona', mode: tab, ...f })
      setData(d)
      if (tab === 'ai') setMade(d.persona); else next()
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  const tabBtn = (id: 'ai' | 'manual', title: string, sub: string, off = false) => (
    <button role="tab" aria-selected={tab === id} aria-disabled={off} disabled={off} className={'wz-tab' + (tab === id ? ' on' : '')} onClick={() => setTab(id)}>
      <span className="wz-card-title">{title}</span>
      <span className="sub">{off ? 'Add an AI key in step 3 to use this' : sub}</span>
    </button>
  )
  return (
    <div>
      <h2>Create your client persona</h2>
      <p className="sub">The persona tells us who to write to. The sequence is built from it later.</p>
      <div className="wz-tabs" role="tablist">
        {tabBtn('ai', 'AI enabled persona', 'Answer three questions, the AI writes it', !aiReady)}
        {tabBtn('manual', 'Manual persona creation', 'Write it yourself, with any AI you like')}
      </div>
      <Err msg={error} />
      {tab === 'ai' ? (
        <div>
          <div className="field"><label htmlFor="p-b">What is your business?</label>
            <textarea id="p-b" className="input" rows={2} value={f.business} onChange={set('business')} placeholder="We run outbound email for B2B software companies" /></div>
          <div className="field"><label htmlFor="p-t">Who are you targeting?</label>
            <textarea id="p-t" className="input" rows={2} value={f.target} onChange={set('target')} placeholder="Heads of sales at SaaS companies with 50 to 200 people, in the UK" /></div>
          <div className="field"><label htmlFor="p-o">What is your offer?</label>
            <textarea id="p-o" className="input" rows={2} value={f.offer} onChange={set('offer')} placeholder="A 30 day pilot: we book 10 qualified meetings or you pay nothing" /></div>
          {made && <div className="field"><label>Your persona</label><pre className="wz-persona">{made.persona}</pre></div>}
          <Actions>
            <button className="btn ghost" onClick={back}>Back</button><span className="grow" />
            <button className="btn" disabled={busy || f.business.trim().length < 3 || f.target.trim().length < 3 || f.offer.trim().length < 3} onClick={() => void save()}>
              {busy ? 'Writing…' : made ? 'Write it again' : 'Create persona'}
            </button>
            <button className="btn primary" disabled={!made || busy} onClick={() => next()}>Continue</button>
          </Actions>
        </div>
      ) : (
        <div>
          <p className="hint" style={{ marginBottom: 10 }}>Ask ChatGPT, Claude, Gemini or any assistant to describe your ideal client, then paste the result here. Say who they are, their job titles, their problems, and what you offer.</p>
          <div className="field"><label htmlFor="m-p">Persona</label>
            <textarea id="m-p" className="input" rows={9} value={f.persona} onChange={set('persona')} placeholder={'Ideal client: …\nDecision maker: …\nPains: …\nBuying triggers: …\nAngle for the first email: …'} /></div>
          <Actions>
            <button className="btn ghost" onClick={back}>Back</button><span className="grow" />
            <button className="btn primary" disabled={busy || f.persona.trim().length < 20} onClick={() => void save()}>{busy ? 'Saving…' : 'Save and continue'}</button>
          </Actions>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- 5. leads

export function LeadsStep({ data, setData, next, back, onAdded }: StepProps & { onAdded: (n: number) => void }) {
  const file = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [pasted, setPasted] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [urls, setUrls] = useState('')
  const [actor, setActor] = useState('')
  const [input, setInput] = useState('{}')
  const [keys, setKeys] = useState<{ apify: string; firecrawl: string }>({ apify: '', firecrawl: '' })
  const [cands, setCands] = useState<Candidate[]>([])
  const has = (p: Provider) => !!data.integrations.find((i) => i.provider === p)?.connected
  const owner = data.role === 'owner'

  async function importRows(rows: { email: string; company: string }[]) {
    setError(''); setMsg(''); setBusy('import')
    try {
      let added = 0, dup = 0, bad = 0
      for (let i = 0; i < rows.length; i += 200) {
        const j = await call<{ added: number; duplicates: number; suppressed: number; invalid: number }>('/api/integrations', { action: 'import', rows: rows.slice(i, i + 200) })
        added += j.added; dup += j.duplicates; bad += j.invalid + j.suppressed
      }
      onAdded(added)
      setMsg(`Added ${added} lead${added === 1 ? '' : 's'} for review${dup ? `, ${dup} already there` : ''}${bad ? `, ${bad} skipped` : ''}.`)
    } catch (e) { setError((e as Error).message) }
    setBusy('')
  }
  async function read(f: File) {
    if (/\.xlsx?$/i.test(f.name)) { setError('Excel files are not supported. Save as CSV first.'); return }
    const rows = parseLeadsCsv(await f.text())
    if (!rows.length) { setError('No email addresses found. The file needs a column with emails.'); return }
    await importRows(rows)
  }
  async function connect(p: 'apify' | 'firecrawl') {
    setBusy(p); setError('')
    try { setData(await call<Onboarding>('/api/onboarding', { action: 'keys', keys: { [p]: keys[p] } })); setKeys({ ...keys, [p]: '' }) }
    catch (e) { setError((e as Error).message) }
    setBusy('')
  }
  async function scrape(source: 'apify' | 'firecrawl') {
    setBusy('find-' + source); setError(''); setMsg('')
    try {
      const body = source === 'firecrawl'
        ? { action: 'find', source, urls: urls.split('\n').map((s) => s.trim()).filter(Boolean) }
        : { action: 'find', source, actor: actor.trim(), input: JSON.parse(input || '{}') }
      const j = await call<{ candidates: Candidate[]; note?: string }>('/api/integrations', body)
      setCands((c) => [...c, ...j.candidates.filter((x) => !c.some((y) => y.email === x.email))])
      setMsg(j.note || (j.candidates.length ? `Found ${j.candidates.length} address${j.candidates.length === 1 ? '' : 'es'}.` : 'No emails found.'))
    } catch (e) { setError(e instanceof SyntaxError ? 'The actor input is not valid JSON.' : (e as Error).message) }
    setBusy('')
  }
  const scraper = (p: 'firecrawl' | 'apify', title: string, blurb: string, body: ReactNode) => (
    <div className="wz-scraper">
      <div className="wz-key-head"><strong>{title}</strong>{has(p) ? <span className="chip ok">Connected</span> : <span className="chip">Not connected</span>}</div>
      <p className="hint">{blurb}</p>
      {has(p) ? body : (
        <form className="wz-inline" onSubmit={(e) => { e.preventDefault(); void connect(p) }}>
          <input className="input" type="password" autoComplete="off" spellCheck={false} aria-label={`${title} API key`} placeholder="Paste API key to connect" disabled={!owner}
            value={keys[p]} onChange={(e) => setKeys({ ...keys, [p]: e.target.value })} />
          <button className="btn" disabled={!owner || busy === p || keys[p].trim().length < 8}>{busy === p ? 'Checking…' : 'Connect'}</button>
        </form>
      )}
    </div>
  )
  return (
    <div>
      <h2>Bring in your leads</h2>
      <p className="sub">Drop a file or pull leads with a scraper. New leads wait in review, nothing is sent until you approve.</p>
      <Err msg={error} />
      {msg && <div className="banner ok" role="status">{msg}</div>}

      <div className={'wz-drop' + (over ? ' over' : '')} role="button" tabIndex={0}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) void read(f) }}
        onClick={() => file.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.current?.click() } }}>
        <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>
        <strong>Drop your leads here</strong>
        <span className="sub">CSV or TSV with an email column (and, if you have it, a company column). Or click to choose a file.</span>
        <input ref={file} type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = '' }} />
      </div>
      <details className="wz-paste">
        <summary>Or paste a list</summary>
        <textarea className="input" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'email,company\nann@acme.com,Acme'} aria-label="Paste leads" />
        <button className="btn sm" disabled={busy === 'import' || !pasted.trim()} onClick={() => void importRows(parseLeadsCsv(pasted)).then(() => setPasted(''))}>Add pasted leads</button>
      </details>

      <h3 className="wz-h3">Or scrape them</h3>
      <div className="wz-scrapers">
        {scraper('firecrawl', 'Firecrawl', 'Reads web pages (up to 5) and returns the emails on them.', (
          <>
            <textarea className="input" rows={3} aria-label="Web addresses" placeholder={'One web address per line\nhttps://example.com/team'} value={urls} onChange={(e) => setUrls(e.target.value)} />
            <button className="btn sm" disabled={!urls.trim() || busy.startsWith('find')} onClick={() => void scrape('firecrawl')}>{busy === 'find-firecrawl' ? 'Reading…' : 'Find emails'}</button>
          </>
        ))}
        {scraper('apify', 'Apify', 'Runs an Apify scraper (an "actor") of your choice and collects the emails.', (
          <>
            <input className="input" aria-label="Apify actor" placeholder="Actor, for example username~actor-name" value={actor} onChange={(e) => setActor(e.target.value)} />
            <textarea className="input" rows={3} aria-label="Actor input (JSON)" value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false} />
            <button className="btn sm" disabled={!actor.trim() || busy.startsWith('find')} onClick={() => void scrape('apify')}>{busy === 'find-apify' ? 'Running…' : 'Run scraper'}</button>
          </>
        ))}
      </div>
      {cands.length > 0 && (
        <div className="wz-found">
          <span>{cands.length} address{cands.length === 1 ? '' : 'es'} found</span>
          <button className="btn primary sm" disabled={busy === 'import'} onClick={() => void importRows(cands.filter((c) => !c.email.startsWith('pending:'))).then(() => setCands([]))}>Add them to my leads</button>
        </div>
      )}
      <Actions>
        <button className="btn ghost" onClick={back}>Back</button><span className="grow" />
        <button className="btn ghost" onClick={() => next('leads')}>Skip for now</button>
        <button className="btn primary" onClick={() => next()}>Finish</button>
      </Actions>
    </div>
  )
}

// ---------------------------------------------------------------- done, with the optional assistant link

export function DoneStep({ data, setData, leadsAdded, finish }: { data: Onboarding; setData: (d: Onboarding) => void; leadsAdded: number; finish: () => void }) {
  const [vals, setVals] = useState<Partial<Record<Provider, string>>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const has = (p: Provider) => !!data.integrations.find((i) => i.provider === p)?.connected
  const owner = data.role === 'owner'
  const keysCount = data.integrations.filter((i) => i.connected).length
  const skipped = data.progress.skipped
  const rows: [string, string, boolean][] = [
    ['Business type', data.business_type ? `${PLANS.find((p) => p.id === data.business_type)?.title}, ${data.seats.limit} seat${data.seats.limit > 1 ? 's' : ''}` : 'Not chosen', !!data.business_type],
    ['API keys', keysCount ? `${keysCount} connected` : 'Skipped, add them any time', keysCount > 0],
    ['Client persona', data.persona ? (data.persona.mode === 'ai' ? 'Written by AI' : 'Written by you') : 'Not created yet', !!data.persona],
    ['Leads', leadsAdded ? `${leadsAdded} added for review` : skipped.includes('leads') ? 'Skipped, add them any time' : 'None yet', leadsAdded > 0],
  ]
  const typed = Object.entries(vals).filter(([, v]) => (v ?? '').trim())
  async function connect() {
    setBusy(true); setError('')
    try {
      const d = await call<Onboarding>('/api/onboarding', { action: 'keys', keys: Object.fromEntries(typed) })
      setData(d)
      const bad = d.results?.filter((r) => r.status === 'rejected' || r.status === 'invalid' || r.status === 'error')
      if (bad?.length) setError(bad.map((r) => `${r.provider}: ${r.message ?? r.status}`).join('. ')); else setVals({})
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  const opt = (id: Provider, title: string, hint: string, recommended = false) => (
    <div className={'wz-assist' + (recommended ? ' rec' : '')} key={id}>
      <div className="wz-key-head"><strong>{title}</strong>{recommended && <span className="chip acc">Suggested</span>}{has(id) && <span className="chip ok">Connected</span>}</div>
      <input className="input" type="password" autoComplete="off" spellCheck={false} aria-label={`${title} API key`} disabled={!owner || has(id)}
        placeholder={has(id) ? 'Already connected' : 'Paste API key (optional)'} value={vals[id] ?? ''} onChange={(e) => setVals({ ...vals, [id]: e.target.value })} />
      <span className="hint">{hint}</span>
    </div>
  )
  return (
    <div>
      <div className="wz-success"><svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
      <h2 style={{ textAlign: 'center' }}>You are all set</h2>
      <p className="sub" style={{ textAlign: 'center' }}>Here is what is ready. Anything you skipped can be added later.</p>
      <ul className="wz-summary">{rows.map(([k, v, ok]) => <li key={k}><span className={'dot ' + (ok ? 'ok' : 'idle')} aria-hidden="true" /><strong>{k}</strong><span className="sub">{v}</span></li>)}</ul>

      <h3 className="wz-h3">Connect an AI assistant <span className="sub">(optional)</span></h3>
      <p className="hint" style={{ marginBottom: 8 }}>We suggest Claude. One OpenAI key covers both ChatGPT and Codex.</p>
      <Err msg={error} />
      <div className="wz-assists">
        {opt('anthropic', 'Claude', 'Suggested: it writes the sharpest cold emails.', true)}
        {opt('openai', 'ChatGPT / Codex', 'Uses your OpenAI API key.')}
        {opt('gemini', 'Gemini', 'Uses your Google AI Studio key.')}
      </div>
      <Actions>
        <span className="grow" />
        <button className="btn" disabled={busy || !typed.length || !owner} onClick={() => void connect()}>{busy ? 'Checking…' : 'Connect'}</button>
        <button className="btn primary" onClick={finish}>Go to my dashboard</button>
      </Actions>
    </div>
  )
}
