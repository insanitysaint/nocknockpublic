import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import Login from '../pages/Login'

export interface User {
  email: string
  name: string
  picture: string
  operator?: boolean
}

interface AuthState {
  user: User
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

// `npm run dev` has no /api functions, so the sign-in gate is skipped there. Set VITE_AUTH_REQUIRED=true to test it anyway.
const SKIP = import.meta.env.DEV && import.meta.env.VITE_AUTH_REQUIRED !== 'true'
const DEV_USER: User = { email: 'dev@localhost', name: 'Local development', picture: '', operator: true }

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(SKIP ? DEV_USER : undefined)

  const load = useCallback(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<User>) : null))
      .then(setUser)
      .catch(() => setUser(null))
  }, [])

  useEffect(() => {
    if (!SKIP) load()
  }, [load])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
    setUser(null)
  }, [])

  if (user === undefined) return <div className="login-wrap" aria-busy="true" />
  if (user === null) return <Login onSignedIn={load} />
  return <Ctx.Provider value={{ user, signOut }}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('AuthGate missing')
  return v
}
