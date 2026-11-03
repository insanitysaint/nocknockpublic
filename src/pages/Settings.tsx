import { useState } from 'react'
import { useToast } from '../components/ui'
import { useStore } from '../lib/store'
import { dailyCap } from './Overview'

const COPY: [string, string][] = [['e1', 'Email 1 · day 0'], ['e2', 'Email 2 · day 5'], ['e3', 'Email 3 · day 10']]

export default function Settings() {
  const { doc, op } = useStore()
  const toast = useToast()
  const [mrr, setMrr] = useState('')
  const [price, setPrice] = useState('')
  const [slot, setSlot] = useState('')
  const [draft, setDraft] = useState<Record<string, { subject: string; body: string }>>({})
  if (!doc) return null

  const run = async (body: Record<string, unknown>, ok: string) => {
    try { await op(body); toast(ok) } catch (e) { toast(e instanceof Error ? e.message : 'Failed', true) }
  }
  const drafts = doc.settings.copy_drafts
  const cur = (k: string) => draft[k] ?? drafts[k] ?? { subject: 'The project you had to turn down', body: '' }

  return (
    <>
      <div className="head"><div className="grow"><h1>Settings</h1><p className="sub">Goal, mailboxes and email copy drafts.</p></div></div>
      <div className="grid g2e" style={{ marginBottom: 14 }}>
        <section className="panel">
          <div className="ph"><h2>Revenue goal</h2></div>
          <div className="pb">
            <div className="row">
              <div className="field" style={{ flex: 1 }}><label htmlFor="mrr">Target MRR ($)</label>
                <input id="mrr" className="input" type="number" value={mrr || doc.settings.goal_mrr} onChange={(e) => setMrr(e.target.value)} /></div>
              <div className="field" style={{ flex: 1 }}><label htmlFor="pr">Minimum client price ($)</label>
                <input id="pr" className="input" type="number" value={price || doc.settings.goal_price} onChange={(e) => setPrice(e.target.value)} /></div>
            </div>
            <button className="btn primary" onClick={() => void run({ op: 'settings.set', settings: { goal_mrr: Number(mrr || doc.settings.goal_mrr), goal_price: Number(price || doc.settings.goal_price) } }, 'Goal saved')}>Save goal</button>
          </div>
        </section>

        <section className="panel">
          <div className="ph"><h2>Mailboxes</h2></div>
          <div className="pb">
            {doc.accounts.map((a) => (
              <div className="note" key={a.email}>
                <div className="meta"><b style={{ color: 'var(--text)' }}>{a.email}</b><span className="spacer" />
                  <span className={'chip ' + (a.inactive ? '' : 'ok')}>{a.inactive ? 'inactive slot' : 'live'}</span></div>
                {a.label} · {a.provider} · {a.inactive ? a.daily_limit : dailyCap(drafts)}/day
              </div>
            ))}
            <p className="hint" style={{ margin: '8px 0 10px' }}>Only the live mailbox sends. Extra slots are placeholders until a second SMTP credential is wired into the n8n workflow.</p>
            <div className="row">
              <input className="input" style={{ flex: 1 }} type="email" placeholder="name@yourdomain.com" aria-label="New mailbox address" value={slot} onChange={(e) => setSlot(e.target.value)} />
              <button className="btn" disabled={!slot.includes('@')} onClick={async () => { await run({ op: 'account.save', account: { email: slot, label: 'Placeholder', provider: 'SMTP', daily_limit: 5, inactive: true } }, 'Slot added'); setSlot('') }}>Add slot</button>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Email copy drafts</h2></div>
        <div className="pb">
          <p className="hint" style={{ marginBottom: 12 }}>Drafts are stored here only. The engine sends the text that lives in its n8n Code nodes, so paste a finished draft there to make it live.</p>
          {COPY.map(([k, label]) => {
            const c = cur(k)
            return (
              <div key={k} style={{ marginBottom: 18 }}>
                <div className="row" style={{ marginBottom: 6 }}><b>{label}</b>{drafts[k] && <span className="chip acc">draft saved</span>}</div>
                <input className="input" style={{ marginBottom: 6 }} aria-label={`${label} subject`} value={c.subject} onChange={(e) => setDraft({ ...draft, [k]: { ...c, subject: e.target.value } })} />
                <textarea className="input" style={{ minHeight: 120 }} aria-label={`${label} body`} placeholder="Hi {first name}, …" value={c.body} onChange={(e) => setDraft({ ...draft, [k]: { ...c, body: e.target.value } })} />
                <div className="row" style={{ marginTop: 6 }}>
                  <button className="btn sm" onClick={() => void run({ op: 'settings.set', settings: { copy_drafts: { [k]: c } } }, 'Draft saved')}>Save draft</button>
                  {drafts[k] && <button className="btn sm ghost" onClick={() => { void run({ op: 'settings.set', settings: { copy_drafts: { [k]: null } } }, 'Draft removed'); setDraft((d) => { const n = { ...d }; delete n[k]; return n }) }}>Discard</button>}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
