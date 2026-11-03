import { useState } from 'react'
import { Empty, Modal, useToast } from '../components/ui'
import { campaignOf, em } from '../lib/domain'
import { useStore } from '../lib/store'
import type { Campaign } from '../lib/types'

const COLORS = ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#f472b6', '#facc15']

export default function Campaigns() {
  const { state, doc, sentByEmail, op } = useStore()
  const toast = useToast()
  const [edit, setEdit] = useState<Partial<Campaign> | null>(null)

  if (!state || !doc) return null

  const stats = (id: string) => {
    const mine = state.leads.filter((l) => campaignOf(l, doc)?.id === id)
    const sentRows = mine.map((l) => sentByEmail.get(em(l))).filter(Boolean)
    return {
      leads: mine.length,
      queued: mine.filter((l) => l.status === 'approved' && !sentByEmail.has(em(l))).length,
      sent: sentRows.length,
      replies: sentRows.filter((r) => r?.replied).length,
    }
  }

  const save = async () => {
    if (!edit) return
    try { await op({ op: 'campaign.save', campaign: edit }); setEdit(null); toast('Campaign saved') }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', true) }
  }
  const toggle = async (c: Campaign) => {
    try { await op({ op: 'campaign.save', campaign: { ...c, status: c.status === 'paused' ? 'active' : 'paused' } }) }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', true) }
  }
  const del = async (c: Campaign) => {
    if (!confirm(`Delete “${c.name}”? Leads keep their data and fall back to the default campaign.`)) return
    try { await op({ op: 'campaign.del', id: c.id }); toast('Deleted') }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', true) }
  }

  return (
    <>
      <div className="head">
        <div className="grow"><h1>Campaigns</h1><p className="sub">Labels that group leads by market. Pausing one is a record in the cockpit; the engine keeps one sender and one pool.</p></div>
        <button className="btn primary" onClick={() => setEdit({ name: '', status: 'active', color: COLORS[doc.campaigns.length % COLORS.length], account: doc.accounts[0]?.email || '', region: '', desc: '' })}>New campaign</button>
      </div>

      {doc.campaigns.length === 0 ? <div className="panel"><Empty>No campaigns yet.</Empty></div> : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
          {doc.campaigns.map((c) => {
            const s = stats(c.id)
            return (
              <section className="panel" key={c.id}>
                <div className="ph">
                  <span className="dot" style={{ background: c.color }} />
                  <h2>{c.name}</h2>
                  <span className="spacer" />
                  <span className={'chip ' + (c.status === 'active' ? 'ok' : c.status === 'paused' ? 'warn' : '')}>{c.status}</span>
                </div>
                <div className="pb">
                  <p className="sub" style={{ marginBottom: 4 }}>{c.region}</p>
                  <p style={{ marginBottom: 12 }}>{c.desc}</p>
                  <div className="row" style={{ gap: 18, marginBottom: 14 }}>
                    {([['Leads', s.leads], ['Queued', s.queued], ['Sent', s.sent], ['Replies', s.replies]] as const).map(([k, v]) => (
                      <div key={k}><div className="sub">{k}</div><b style={{ fontSize: 18 }}>{v}</b></div>
                    ))}
                  </div>
                  <div className="row">
                    <button className="btn sm" onClick={() => setEdit(c)}>Edit</button>
                    <button className="btn sm" onClick={() => void toggle(c)}>{c.status === 'paused' ? 'Resume' : 'Pause'}</button>
                    <span className="spacer" />
                    <button className="btn sm danger" onClick={() => void del(c)}>Delete</button>
                  </div>
                </div>
              </section>
            )
          })}
        </div>
      )}

      {edit && (
        <Modal title={edit.id ? 'Edit campaign' : 'New campaign'} onClose={() => setEdit(null)}>
          <div className="field"><label htmlFor="cn">Name</label><input id="cn" className="input" value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus /></div>
          <div className="field"><label htmlFor="cr">Region</label><input id="cr" className="input" value={edit.region || ''} onChange={(e) => setEdit({ ...edit, region: e.target.value })} /></div>
          <div className="field"><label htmlFor="cd">Description</label><textarea id="cd" className="input" style={{ minHeight: 70 }} value={edit.desc || ''} onChange={(e) => setEdit({ ...edit, desc: e.target.value })} /></div>
          <div className="row">
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="cs">Status</label>
              <select id="cs" className="input" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as Campaign['status'] })}>
                <option value="active">Active</option><option value="paused">Paused</option><option value="draft">Draft</option>
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="ca">Mailbox</label>
              <select id="ca" className="input" value={edit.account} onChange={(e) => setEdit({ ...edit, account: e.target.value })}>
                {doc.accounts.map((a) => <option key={a.email} value={a.email}>{a.email}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Colour</label>
            <div className="row">{COLORS.map((c) => (
              <button key={c} aria-label={c} onClick={() => setEdit({ ...edit, color: c })}
                style={{ width: 26, height: 26, borderRadius: '50%', background: c, border: edit.color === c ? '3px solid var(--text)' : '2px solid var(--line)' }} />
            ))}</div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn primary" onClick={() => void save()}>Save</button>
          </div>
        </Modal>
      )}
    </>
  )
}
