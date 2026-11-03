import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { sentIndex } from './domain'
import type { CkDoc, CkState, DashState, SentRow } from './types'

interface Store {
  state: DashState | null
  ck: CkState | null
  doc: CkDoc | null
  sentByEmail: Map<string, SentRow>
  error: string
  loading: boolean
  updatedAt: Date | null
  refresh: () => Promise<void>
  /** Run a cockpit-document operation and keep the local copy in sync. */
  op: (body: Record<string, unknown>) => Promise<void>
}

const Ctx = createContext<Store | null>(null)
const POLL_MS = 30_000

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DashState | null>(null)
  const [ck, setCk] = useState<CkState | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const busy = useRef(false)

  const refresh = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    try {
      const [s, c] = await Promise.all([api.state(), api.ck()])
      setState(s)
      setCk({ doc: c.doc, replies: c.replies })
      setError('')
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load')
    } finally {
      busy.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const tick = () => { if (!document.hidden) void refresh() }
    const t = setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [refresh])

  const op = useCallback(async (body: Record<string, unknown>) => {
    const doc = await api.op(body)
    setCk((p) => (p ? { ...p, doc } : p))
  }, [])

  const sentByEmail = useMemo(() => sentIndex(state?.sent ?? []), [state])

  const value = useMemo<Store>(
    () => ({ state, ck, doc: ck?.doc ?? null, sentByEmail, error, loading, updatedAt, refresh, op }),
    [state, ck, sentByEmail, error, loading, updatedAt, refresh, op],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const v = useContext(Ctx)
  if (!v) throw new Error('StoreProvider missing')
  return v
}
