import { Empty, fmtDateTime, useToast } from '../components/ui'
import { useStore } from '../lib/store'

export const STAGES: [string, string][] = [
  ['', 'No stage'], ['interested', 'Interested'], ['call', 'Call booked'],
  ['proposal', 'Proposal sent'], ['won', 'Won'], ['lost', 'Lost'],
]

export default function Replies() {
  const { ck, doc, state, op } = useStore()
  const toast = useToast()
  if (!ck || !doc || !state) return null

  const setStage = async (email: string, value: string) => {
    try { await op({ op: 'stage.set', key: email.toLowerCase(), value }) }
    catch (e) { toast(e instanceof Error ? e.message : 'Failed', true) }
  }
  const stopped = state.sent.filter((r) => r.replied)

  return (
    <>
      <div className="head"><div className="grow"><h1>Replies</h1><p className="sub">Who answered, with a snippet when the reply reader is on. Tag a stage to track the deal.</p></div></div>

      <section className="panel" style={{ marginBottom: 14 }}>
        <div className="ph"><h2>Inbox</h2><span className="sub">{ck.replies.length} replies</span></div>
        {ck.replies.length === 0 ? <Empty>No replies yet. The reply reader checks your mailbox over IMAP.</Empty> : ck.replies.slice(0, 50).map((r) => (
          <div className="note" key={r.id} style={{ margin: 12 }}>
            <div className="meta">
              <b style={{ color: 'var(--text)' }}>{r.name || r.from}</b><span>{r.from}</span><span className="spacer" /><span>{fmtDateTime(r.date)}</span>
            </div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.subject}</div>
            <div style={{ marginBottom: 8 }}>{r.snippet || '(no text)'}</div>
            <select className="input" style={{ width: 170 }} aria-label="Stage" value={doc.stage[r.from.toLowerCase()] || ''} onChange={(e) => void setStage(r.from, e.target.value)}>
              {STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="ph"><h2>Sequences stopped</h2><span className="sub">replied, bounced or opted out</span></div>
        {stopped.length === 0 ? <Empty>None yet.</Empty> : (
          <table className="t">
            <thead><tr><th>Company</th><th>Email</th><th>Date</th><th>Stage</th></tr></thead>
            <tbody>{stopped.map((r) => (
              <tr key={r.email}>
                <td className="co">{r.company}</td><td className="em">{r.email}</td><td>{r.replied_date || r.replied}</td>
                <td><select className="input" style={{ width: 150 }} aria-label={`Stage for ${r.company}`} value={doc.stage[(r.email || "").toLowerCase()] || ''} onChange={(e) => void setStage(r.email, e.target.value)}>
                  {STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  )
}
