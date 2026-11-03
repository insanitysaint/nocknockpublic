import { Link } from 'react-router-dom'
import { Empty, Score, Stat, fmtDate } from '../components/ui'
import { officeOpen, queueOf, sendsByDay, sentIndex, todayUtc } from '../lib/domain'
import { useStore } from '../lib/store'

export const dailyCap = (copyDrafts?: Record<string, { body: string }>) =>
  parseInt(copyDrafts?.__cap?.body ?? '') || 15

export default function Overview() {
  const { state, doc } = useStore()
  if (!state || !doc) return null
  const { leads, sent } = state
  const today = todayUtc()
  const cap = dailyCap(doc.settings.copy_drafts)

  const sentToday = sent.filter((r) => String(r.sent_date).slice(0, 10) === today).length
  const followUps = sent.reduce((n, r) => n + (r.follow_up_1_sent ? 1 : 0) + (r.follow_up_2_sent ? 1 : 0), 0)
  const replied = sent.filter((r) => r.replied).length
  const rate = sent.length ? Math.round((replied / sent.length) * 100) : null
  const sentIdx = sentIndex(sent)
  const queue = queueOf(leads, sentIdx)
  const review = leads.filter((l) => l.status === 'review' && l.email).length

  const days = sendsByDay(sent)
  const max = Math.max(1, ...days.map((d) => d.first + d.follow))

  const approved = leads.filter((l) => l.status === 'approved' || l.status === 'sent').length
  const funnel: [string, number][] = [
    ['Leads in inbox', leads.length],
    ['Approved', approved],
    ['Emailed', sent.length],
    ['Followed up', sent.filter((r) => r.follow_up_1_sent).length],
    ['Replied', replied],
  ]

  const won = Object.values(doc.stage).filter((s) => s === 'won').length
  const target = Math.max(1, Math.ceil(doc.settings.goal_mrr / (doc.settings.goal_price || 1)))
  const nextUp = queue.slice(0, 6)

  return (
    <>
      <div className="head">
        <div className="grow">
          <h1>Overview</h1>
          <p className="sub">Leads, sends and replies from your n8n outreach engine.</p>
        </div>
        <span className="chip ok">Engine live</span>
        <span className="chip">Today {sentToday}/{cap}</span>
      </div>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat k="Emails sent" v={sent.length} s={`${leads.length} leads in inbox`} />
        <Stat k="Sent today" v={sentToday} s={`cap ${cap} a day`} />
        <Stat k="Follow-ups" v={followUps} s="email 2 and 3" />
        <Stat k="Reply rate" v={rate === null ? '–' : rate + '%'} s={`${replied} stopped or replied`} />
        <Stat k="Queued" v={queue.length} s="approved, not yet emailed" />
        <Stat k="Awaiting review" v={review} s={<Link to="/pipeline">Review leads</Link>} />
      </div>

      <div className="grid g2" style={{ marginBottom: 14 }}>
        <section className="panel">
          <div className="ph"><h2>Emails sent per day</h2><span className="sub">last 14 days</span>
            <span className="spacer" />
            <span className="chip acc"><span className="dot" style={{ background: 'var(--accent)' }} />First</span>
            <span className="chip"><span className="dot" style={{ background: 'var(--mut)' }} />Follow-up</span>
          </div>
          <div className="pb">
            <div className="bar-chart" role="img" aria-label="Bar chart of emails sent per day">
              {days.map((d) => (
                <div className="col" key={d.day} title={`${d.day}: ${d.first} first, ${d.follow} follow-ups`}>
                  <div className="seg" style={{ height: `${(d.follow / max) * 100}%`, background: 'var(--mut)', opacity: 0.55 }} />
                  <div className="seg" style={{ height: `${(d.first / max) * 100}%`, background: 'var(--accent)' }} />
                </div>
              ))}
            </div>
            <div className="bar-chart" style={{ height: 'auto', marginTop: 2 }} aria-hidden="true">
              {days.map((d, i) => <div className="lbl" style={{ flex: 1 }} key={d.day}>{i % 2 === 0 ? d.day.slice(8) : ''}</div>)}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="ph"><h2>Pipeline funnel</h2></div>
          <div className="pb funnel">
            {funnel.map(([label, n]) => (
              <div className="fr" key={label}>
                <span>{label}</span>
                <div className="trk"><div className="fill" style={{ width: `${(n / Math.max(1, funnel[0][1])) * 100}%` }} /></div>
                <b style={{ textAlign: 'right' }}>{n}</b>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid g2e">
        <section className="panel">
          <div className="ph"><h2>Next up</h2><span className="sub">highest score first</span><span className="spacer" /><Link to="/send">Send →</Link></div>
          {nextUp.length === 0 ? <Empty>Nothing queued. Approve leads in the pipeline.</Empty> : (
            <table className="t"><tbody>
              {nextUp.map((l) => (
                <tr key={l.lead_id}>
                  <td><div className="co">{l.company}</div><div className="em">{l.email}</div></td>
                  <td>{l.location}</td>
                  <td><Score lead={l} /></td>
                  <td>{officeOpen(l) ? <span className="chip ok">office open</span> : <span className="chip">closed</span>}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </section>

        <section className="panel">
          <div className="ph"><h2>Revenue goal</h2><span className="sub">${doc.settings.goal_mrr.toLocaleString()} MRR</span></div>
          <div className="pb">
            <div className="row" style={{ marginBottom: 8 }}>
              <b style={{ fontSize: 22 }}>{won}</b><span className="sub">of {target} clients won at ${doc.settings.goal_price.toLocaleString()}+ each</span>
            </div>
            <div className="progress"><i style={{ width: `${Math.min(100, (won / target) * 100)}%` }} /></div>
            <p className="hint" style={{ marginTop: 10 }}>
              Mark a lead as “Won” on the <Link to="/replies">Replies</Link> screen to move this bar. Last update {fmtDate(doc.updated || undefined) || 'never'}.
            </p>
          </div>
        </section>
      </div>
    </>
  )
}
