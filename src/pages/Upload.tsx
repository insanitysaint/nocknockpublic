import { useMemo, useRef, useState } from 'react'
import { Empty, fmtDateTime, useToast } from '../components/ui'
import { api } from '../lib/api'
import { useStore } from '../lib/store'

const SOURCES = ['Manual', 'Perplexity', 'Gemini', 'Clutch', 'Scraper', 'Other']
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

/** Light client-side read of the pasted table, just for the preview and campaign assignment. The engine's intake does the real parsing. */
function peek(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*\|?\s*[-:| ]+\|?\s*$/.test(l))
  if (lines.length < 2) return { rows: 0, emails: [] as string[], withEmail: 0 }
  const body = lines.slice(1)
  const emails = new Set<string>()
  let withEmail = 0
  for (const l of body) {
    const m = l.match(EMAIL_RE)
    if (m) { withEmail++; emails.add(m[0].toLowerCase()) }
  }
  return { rows: body.length, emails: [...emails], withEmail }
}

export default function Upload() {
  const { doc, op, refresh } = useStore()
  const toast = useToast()
  const [text, setText] = useState('')
  const [source, setSource] = useState('Manual')
  const [campaign, setCampaign] = useState('')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const info = useMemo(() => peek(text), [text])

  if (!doc) return null

  const readFile = async (f: File) => {
    if (/\.xlsx?$/i.test(f.name)) { toast('Excel files are not supported. Save as CSV first.', true); return }
    setText(await f.text())
  }

  const submit = async () => {
    if (!info.rows) return
    setBusy(true)
    try {
      await api.upload(source, text)
      if (campaign && info.emails.length) await op({ op: 'assign', campaign, emails: info.emails })
      await op({ op: 'upload.log', entry: { source, campaign: doc.campaigns.find((c) => c.id === campaign)?.name || '', rows: info.rows, added: info.rows } })
      setText('')
      toast(`Sent ${info.rows} rows to intake. New leads land in Review.`)
      setTimeout(() => void refresh(), 2500)
    } catch (e) { toast(e instanceof Error ? e.message : 'Upload failed', true) }
    finally { setBusy(false) }
  }

  return (
    <>
      <div className="head"><div className="grow"><h1>Upload leads</h1><p className="sub">Paste a table or drop a CSV. The engine cleans it, removes duplicates, finds public emails and scores each lead.</p></div></div>

      <div className="grid g2">
        <section className="panel">
          <div className="pb">
            <div
              className={'dropzone' + (over ? ' over' : '')}
              onDragOver={(e) => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void readFile(f) }}
            >
              Drop a CSV or TSV here, or{' '}
              <button className="btn sm" onClick={() => file.current?.click()}>choose a file</button>
              <input ref={file} type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = '' }} />
            </div>
            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="paste">Or paste a table (markdown, CSV or tab-separated, with a header row)</label>
              <textarea id="paste" className="input" style={{ minHeight: 200, fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }}
                placeholder={'Company\tWebsite\tEmail\tLocation\tNotes\nExample Studio\texample-studio.com\thello@example-studio.com\tDubai, UAE\tSmall web studio'}
                value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="ph"><h2>Import settings</h2></div>
          <div className="pb">
            <div className="field"><label htmlFor="src">Source</label>
              <select id="src" className="input" value={source} onChange={(e) => setSource(e.target.value)}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label htmlFor="camp">Assign to campaign</label>
              <select id="camp" className="input" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
                <option value="">Automatic (by location)</option>
                {doc.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <p className="sub" style={{ marginBottom: 14 }}>
              {info.rows ? <>Detected <b>{info.rows}</b> rows, <b>{info.withEmail}</b> with an email visible.</> : 'Nothing to import yet.'}
            </p>
            <button className="btn primary" disabled={!info.rows || busy} onClick={() => void submit()}>{busy ? 'Sending…' : `Add ${info.rows || ''} leads`}</button>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="ph"><h2>Upload history</h2></div>
        {doc.uploads.length === 0 ? <Empty>No uploads yet.</Empty> : (
          <table className="t">
            <thead><tr><th>When</th><th>Source</th><th>Campaign</th><th>Rows</th></tr></thead>
            <tbody>{doc.uploads.slice(0, 15).map((u, i) => (
              <tr key={i}><td>{fmtDateTime(u.ts)}</td><td>{u.source}</td><td>{u.campaign || 'Automatic'}</td><td>{u.rows}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </>
  )
}
