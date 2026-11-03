import { useMemo, useState } from 'react'
import { Bars, Empty, Score, StatusChip, useToast } from '../components/ui'
import { api } from '../lib/api'
import { campaignOf, em, score, sequenceOf } from '../lib/domain'
import { useStore } from '../lib/store'
import type { Lead } from '../lib/types'

type Filter = 'review' | 'approved' | 'sent' | 'rejected' | 'no_email' | 'all'
const FILTERS: [Filter, string][] = [
  ['review', 'Review'], ['approved', 'Approved'], ['sent', 'Emailed'],
  ['rejected', 'Rejected'], ['no_email', 'No email'], ['all', 'All'],
]

export default function Pipeline() {
  const { state, doc, sentByEmail, refresh } = useStore()
  const toast = useToast()
  const [filter, setFilter] = useState<Filter>('review')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [min, setMin] = useState('8')

  const leads = state?.leads ?? []
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: leads.length }
    for (const l of leads) c[l.status] = (c[l.status] || 0) + 1
    return c
  }, [leads])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return leads
      .filter((l) => filter === 'all' || l.status === filter || (filter === 'sent' && (l.status === 'replied' || l.status === 'bounced')))
      .filter((l) => !needle || `${l.company} ${l.email} ${l.location}`.toLowerCase().includes(needle))
      .sort((a, b) => score(b) - score(a))
  }, [leads, filter, q])

  if (!state || !doc) return null

  const visible = rows.slice(0, 200)
  const allOn = visible.length > 0 && visible.every((l) => sel.has(l.lead_id))
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function decide(ids: string[], d: 'approve' | 'reject' | 'undo') {
    if (!ids.length) return
    setBusy(d)
    try {
      // The engine rewrites one CSV per call, so decisions go through one at a time.
      let i = 0
      for (const id of ids) { toast(`${d === 'approve' ? 'Approving' : d === 'reject' ? 'Rejecting' : 'Undoing'} ${++i} of ${ids.length}…`); await api.decide({ id, d }) }
      setSel(new Set())
      await refresh()
      toast('Done')
    } catch (e) { toast(e instanceof Error ? e.message : 'Failed', true) }
    finally { setBusy('') }
  }

  async function bulkApprove() {
    const n = parseFloat(min)
    if (!n) return
    setBusy('bulk')
    try { await api.decide({ bulk: 'approve', min: String(n) }); await refresh(); toast(`Approved everything scoring ${n}+`) }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', true) }
    finally { setBusy('') }
  }

  const act = (l: Lead) => {
    const s = l.status
    if (s === 'review' || s === 'new' || s === 'no_email') return (
      <>
        <button className="btn sm" disabled={!!busy || !l.email} onClick={() => void decide([l.lead_id], 'approve')}>Approve</button>
        <button className="btn sm danger" disabled={!!busy} onClick={() => void decide([l.lead_id], 'reject')}>Reject</button>
      </>
    )
    if (s === 'approved') return <button className="btn sm" disabled={!!busy} onClick={() => void decide([l.lead_id], 'undo')}>Undo</button>
    if (s === 'rejected') return <button className="btn sm" disabled={!!busy} onClick={() => void decide([l.lead_id], 'undo')}>Restore</button>
    return null
  }

  return (
    <>
      <div className="head">
        <div className="grow"><h1>Pipeline</h1><p className="sub">Nothing is emailed until you approve it here.</p></div>
        <input className="input" style={{ width: 220 }} placeholder="Search company, email, place" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
      </div>

      <div className="row" style={{ marginBottom: 14 }}>
        <div className="tabs" role="tablist">
          {FILTERS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setSel(new Set()) }}>
              {label}<span className="n">{counts[k] ?? 0}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        {filter === 'review' && (
          <div className="row">
            <span className="sub">Approve all scoring</span>
            <input className="input" style={{ width: 64 }} type="number" min={1} max={10} value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum score" />
            <span className="sub">+</span>
            <button className="btn" disabled={!!busy} onClick={() => void bulkApprove()}>Approve</button>
          </div>
        )}
      </div>

      {sel.size > 0 && (
        <div className="banner ok" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {sel.size} selected
          <span className="spacer" />
          <button className="btn sm" disabled={!!busy} onClick={() => void decide([...sel], 'approve')}>Approve</button>
          <button className="btn sm" disabled={!!busy} onClick={() => void decide([...sel], 'reject')}>Reject</button>
          <button className="btn sm" disabled={!!busy} onClick={() => void decide([...sel], 'undo')}>Move back to review</button>
        </div>
      )}

      <div className="panel">
        {visible.length === 0 ? <Empty>No leads here.</Empty> : (
          <div className="scroll">
            <table className="t">
              <thead><tr>
                <th style={{ width: 34 }}><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(visible.map((l) => l.lead_id)))} /></th>
                <th>Company</th><th>Location</th><th>Score</th><th>Campaign</th><th>Sequence</th><th>Status</th><th />
              </tr></thead>
              <tbody>
                {visible.map((l) => {
                  const seq = sequenceOf(l, sentByEmail)
                  const c = campaignOf(l, doc)
                  return (
                    <tr key={l.lead_id}>
                      <td><input type="checkbox" aria-label={`Select ${l.company}`} checked={sel.has(l.lead_id)} onChange={() => toggle(l.lead_id)} /></td>
                      <td>
                        <div className="co">{l.company || '(no name)'}</div>
                        <div className="em">{em(l) || l.website || 'no email'}</div>
                      </td>
                      <td>{l.location}</td>
                      <td><Score lead={l} /></td>
                      <td>{c && <span className="chip"><span className="dot" style={{ background: c.color }} />{c.name.length > 20 ? c.name.slice(0, 19) + '…' : c.name}</span>}</td>
                      <td>{seq.step > 0
                        ? <span className={'chip ' + (seq.stopped ? 'bad' : '')}><Bars n={seq.step} />{seq.stopped ? `Stopped ${seq.step}/3` : `${seq.step}/3`}</span>
                        : l.status === 'approved' ? <span className="chip"><Bars n={0} />Queued</span> : null}</td>
                      <td><StatusChip status={l.status} /></td>
                      <td><div className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>{act(l)}</div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > visible.length && <p className="hint" style={{ padding: 12 }}>Showing the top {visible.length} of {rows.length}. Use search to narrow down.</p>}
      </div>
    </>
  )
}
