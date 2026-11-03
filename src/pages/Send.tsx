import { useEffect, useRef, useState } from 'react'
import { Empty, Modal, Score, useToast } from '../components/ui'
import { api } from '../lib/api'
import { campaignOf, em, officeOpen, queueOf, sentIndex, todayUtc } from '../lib/domain'
import { useStore } from '../lib/store'
import type { SendBody } from '../lib/types'
import { dailyCap } from './Overview'

interface Plan { body: SendBody; count: number; label: string }

export default function Send() {
  const { state, doc, refresh, op } = useStore()
  const toast = useToast()
  const [n, setN] = useState('5')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [plan, setPlan] = useState<Plan | null>(null)
  const [running, setRunning] = useState<{ target: number; base: number } | null>(null)
  const [probe, setProbe] = useState('')
  const timer = useRef<ReturnType<typeof setInterval>>()

  const sent = state?.sent ?? []
  const sentToday = sent.filter((r) => String(r.sent_date).slice(0, 10) === todayUtc()).length

  // While a batch is going out (about 5 seconds per email), poll until the log catches up.
  useEffect(() => {
    if (!running) return
    timer.current = setInterval(() => void refresh(), 6000)
    return () => clearInterval(timer.current)
  }, [running, refresh])
  useEffect(() => {
    if (running && sentToday - running.base >= running.target) {
      setRunning(null)
      toast('Batch finished')
    }
  }, [sentToday, running, toast])

  if (!state || !doc) return null
  const cap = dailyCap(doc.settings.copy_drafts)
  const queue = queueOf(state.leads, sentIndex(sent))
  const due = queue.filter((l) => officeOpen(l))
  const left = Math.max(0, cap - sentToday)

  const start = async () => {
    if (!plan) return
    const p = plan
    setPlan(null)
    try {
      await api.send({ ...p.body, cap })
      setRunning({ target: p.count, base: sentToday })
      setSel(new Set())
      toast(`Sending ${p.count} email${p.count === 1 ? '' : 's'}. About 5 seconds each.`)
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not start the send', true) }
  }

  const saveCap = async (v: string) => {
    const c = Math.max(1, Math.min(60, parseInt(v) || 15))
    try { await op({ op: 'settings.set', settings: { copy_drafts: { __cap: { subject: 'cap', body: String(c) } } } }); toast(`Daily cap set to ${c}`) }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', true) }
  }

  const testMailbox = async () => {
    setProbe('Sending…')
    try {
      const j = await api.testMailbox()
      setProbe(j.ok ? 'Test email sent to your own inbox' : 'Mailbox error: ' + (j.error || 'unknown'))
    } catch (e) { setProbe(e instanceof Error ? e.message : 'Failed') }
  }

  const count = Math.max(1, Math.min(60, parseInt(n) || 1))

  return (
    <>
      <div className="head">
        <div className="grow"><h1>Send</h1><p className="sub">Approved leads that have not been emailed yet, highest score first. These are real emails.</p></div>
        <span className="chip">Today {sentToday}/{cap}</span>
        {running && <span className="chip warn">Sending… {Math.max(0, sentToday - running.base)}/{running.target}</span>}
      </div>

      <div className="grid g2e" style={{ marginBottom: 14 }}>
        <section className="panel">
          <div className="ph"><h2>Send a batch</h2></div>
          <div className="pb">
            <div className="row" style={{ marginBottom: 12 }}>
              <input className="input" style={{ width: 80 }} type="number" min={1} max={60} value={n} onChange={(e) => setN(e.target.value)} aria-label="How many to send" />
              <button className="btn primary" disabled={!!running || queue.length === 0}
                onClick={() => setPlan({ body: { mode: 'next', n: count }, count: Math.min(count, queue.length), label: 'best-scored first' })}>
                Send next {Math.min(count, queue.length)}
              </button>
            </div>
            <div className="row" style={{ marginBottom: 12 }}>
              <button className="btn" disabled={!!running || due.length === 0 || left === 0}
                onClick={() => { const c = Math.min(due.length, left); setPlan({ body: { mode: 'due', n: c }, count: c, label: 'only leads whose office is open now' }) }}>
                Send {Math.min(due.length, left)} inside office hours
              </button>
              <button className="btn" disabled={!!running || sel.size === 0}
                onClick={() => setPlan({ body: { mode: 'ids', ids: [...sel] }, count: sel.size, label: 'selected leads' })}>
                Send {sel.size} selected
              </button>
            </div>
            <p className="hint">The hourly schedule in n8n already sends within office hours on its own. Use this panel for manual top-ups.</p>
          </div>
        </section>

        <section className="panel">
          <div className="ph"><h2>Limits and mailbox</h2></div>
          <div className="pb">
            <div className="field">
              <label htmlFor="cap">Daily cap for manual sends</label>
              <div className="row">
                <input id="cap" className="input" style={{ width: 90 }} type="number" min={1} max={60} defaultValue={cap} key={cap}
                  onBlur={(e) => { if (parseInt(e.target.value) !== cap) void saveCap(e.target.value) }} />
                <span className="hint">{left} left today</span>
              </div>
            </div>
            <div className="row">
              <button className="btn" onClick={() => void testMailbox()}>Send test email to myself</button>
              {probe && <span className="sub">{probe}</span>}
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph"><h2>Queue</h2><span className="sub">{queue.length} approved</span></div>
        {queue.length === 0 ? <Empty>Queue is empty. Approve leads in the pipeline.</Empty> : (
          <div className="scroll">
            <table className="t">
              <thead><tr>
                <th style={{ width: 34 }} /><th>Company</th><th>Location</th><th>Score</th><th>Campaign</th><th>Office</th>
              </tr></thead>
              <tbody>
                {queue.slice(0, 150).map((l) => {
                  const c = campaignOf(l, doc)
                  return (
                    <tr key={l.lead_id}>
                      <td><input type="checkbox" aria-label={`Select ${l.company}`} checked={sel.has(l.lead_id)}
                        onChange={() => setSel((p) => { const x = new Set(p); if (x.has(l.lead_id)) x.delete(l.lead_id); else x.add(l.lead_id); return x })} /></td>
                      <td><div className="co">{l.company}</div><div className="em">{em(l)}</div></td>
                      <td>{l.location}</td>
                      <td><Score lead={l} /></td>
                      <td>{c && <span className="chip"><span className="dot" style={{ background: c.color }} />{c.name}</span>}</td>
                      <td>{officeOpen(l) ? <span className="chip ok">open</span> : <span className="chip">closed</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {plan && (
        <Modal title="Send real emails?" onClose={() => setPlan(null)}>
          <p style={{ marginBottom: 12 }}>
            This will email <b>{plan.count}</b> lead{plan.count === 1 ? '' : 's'} now ({plan.label}). Test mode is off in the engine, so these go to the real recipients.
          </p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setPlan(null)}>Cancel</button>
            <button className="btn primary" onClick={() => void start()}>Send {plan.count}</button>
          </div>
        </Modal>
      )}
    </>
  )
}
