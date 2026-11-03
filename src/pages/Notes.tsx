import { useState } from 'react'
import { Empty, fmtDateTime, useToast } from '../components/ui'
import { useStore } from '../lib/store'

export default function Notes() {
  const { doc, op } = useStore()
  const toast = useToast()
  const [text, setText] = useState('')
  if (!doc) return null

  const run = async (body: Record<string, unknown>, ok?: string) => {
    try { await op(body); if (ok) toast(ok) } catch (e) { toast(e instanceof Error ? e.message : 'Failed', true) }
  }
  const list = [...doc.notes.global].sort((a, b) => Number(b.pinned) - Number(a.pinned))
  const leadNotes = Object.entries(doc.notes.leads)

  return (
    <>
      <div className="head"><div className="grow"><h1>Notes</h1><p className="sub">For you only. Notes are never sent in any email.</p></div></div>
      <div className="grid g2">
        <section className="panel">
          <div className="ph"><h2>General</h2></div>
          <div className="pb">
            <textarea className="input" aria-label="New note" placeholder="Campaign ideas, to-dos…" value={text} onChange={(e) => setText(e.target.value)} />
            <div style={{ marginTop: 8 }}>
              <button className="btn primary" disabled={!text.trim()} onClick={async () => { await run({ op: 'note.add', scope: 'global', text }, 'Note added'); setText('') }}>Add note</button>
            </div>
            <div style={{ marginTop: 16 }}>
              {list.length === 0 ? <Empty>No notes yet.</Empty> : list.map((n) => (
                <div className="note" key={n.id}>
                  <div className="meta">{n.pinned && <span className="chip acc">pinned</span>}<span>{fmtDateTime(n.ts)}</span><span className="spacer" />
                    <button className="btn ghost sm" onClick={() => void run({ op: 'note.pin', scope: 'global', id: n.id })}>{n.pinned ? 'Unpin' : 'Pin'}</button>
                    <button className="btn ghost sm danger" onClick={() => void run({ op: 'note.del', scope: 'global', id: n.id })}>Delete</button>
                  </div>
                  {n.text}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="panel">
          <div className="ph"><h2>Lead notes</h2></div>
          <div className="pb">
            {leadNotes.length === 0 ? <Empty>No lead-specific notes.</Empty> : leadNotes.map(([key, ns]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <div className="co" style={{ marginBottom: 4 }}>{key}</div>
                {ns.map((n) => <div className="note" key={n.id}><div className="meta">{fmtDateTime(n.ts)}</div>{n.text}</div>)}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  )
}
