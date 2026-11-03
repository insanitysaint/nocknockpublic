import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { score, tier } from '../lib/domain'
import type { Lead } from '../lib/types'

/* ---------- icons ---------- */
const P: Record<string, string> = {
  overview: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  pipeline: 'M4 6h16M4 12h16M4 18h10',
  send: 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  campaigns: 'M4 21V4M4 4h13l-2 4 2 4H4',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  replies: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  notes: 'M5 3h14v18H5zM9 8h6M9 12h6M9 16h3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  x: 'M18 6L6 18M6 6l12 12',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
}
export const Icon = ({ name }: { name: keyof typeof P | string }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d={P[name] || ''} /></svg>
)

/* ---------- toasts ---------- */
interface T { id: number; msg: string; err: boolean }
const ToastCtx = createContext<(msg: string, err?: boolean) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([])
  const push = useCallback((msg: string, err = false) => {
    const id = Date.now() + Math.random()
    setItems((p) => [...p, { id, msg, err }])
    setTimeout(() => setItems((p) => p.filter((x) => x.id !== id)), err ? 6000 : 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={'toast' + (t.err ? ' err' : '')}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- small pieces ---------- */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="ph"><h2>{title}</h2><button className="btn ghost sm" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <div className="pb">{children}</div>
      </div>
    </div>
  )
}

export const Stat = ({ k, v, s }: { k: string; v: ReactNode; s?: ReactNode }) => (
  <div className="panel stat"><div className="k">{k}</div><div className="v">{v}</div>{s && <div className="s">{s}</div>}</div>
)

export const Bars = ({ n }: { n: number }) => (
  <span className="bars"><b className={n >= 1 ? 'on' : ''} /><b className={n >= 2 ? 'on' : ''} /><b className={n >= 3 ? 'on' : ''} /></span>
)

export const Score = ({ lead }: { lead: Lead }) => {
  const s = score(lead)
  return <span className={'score ' + tier(s)}>{lead.persona_score || '–'}</span>
}

const STATUS_TONE: Record<string, string> = {
  approved: 'acc', sent: 'ok', replied: 'ok', review: 'warn', rejected: 'bad', bounced: 'bad', no_email: '', new: '',
}
export const StatusChip = ({ status }: { status: string }) => (
  <span className={'chip ' + (STATUS_TONE[status] ?? '')}>{status.replace('_', ' ')}</span>
)

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>

export const fmtDate = (s?: string) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
export const fmtDateTime = (s?: string) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
