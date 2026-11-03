import { useState, type FormEvent } from 'react'

const MESSAGES: Record<string, string> = {
  denied: 'That account is not allowed to use this app.',
  cancelled: 'Sign-in was cancelled.',
  unverified: 'That provider did not return a verified email address.',
  state: 'The sign-in session expired. Please try again.',
  token: 'Sign-in failed. Please try again.',
}

export default function Login({ onSignedIn }: { onSignedIn: () => void }) {
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(MESSAGES[new URLSearchParams(window.location.search).get('error') ?? ''] ?? '')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, password }),
      })
      if (res.ok) return onSignedIn()
      const j = (await res.json().catch(() => ({}))) as { error?: string }
      setError(j.error || 'Sign-in failed.')
    } catch {
      setError('Cannot reach the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-wrap">
      <section className="login-card panel">
        <div className="brand" style={{ padding: 0, marginBottom: 18 }}>
          <img src="/logo.svg?v=1" alt="" width={28} height={28} style={{ display: 'block' }} />
          Email Automation
        </div>
        <h1 style={{ marginBottom: 6 }}>Sign in</h1>
        <p className="sub" style={{ marginBottom: 18 }}>Choose how you want to sign in.</p>
        {error && <div className="banner bad" role="alert">{error}</div>}

        <form onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="uid">ID</label>
            <input id="uid" className="input" autoComplete="username" autoCapitalize="none" spellCheck={false}
              value={id} onChange={(e) => setId(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn primary wide" disabled={busy || !id || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>

        <div className="or"><span>or</span></div>

        <a className="btn wide provider" href="/api/auth/google">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.64 4.1-5.35 4.1a5.9 5.9 0 1 1 0-11.8c1.87 0 3.12.8 3.84 1.48l2.6-2.5A9.4 9.4 0 0 0 12 2.5a9.5 9.5 0 1 0 0 19c5.5 0 9.1-3.87 9.1-9.3 0-.62-.07-1.1-.15-1.6z" />
          </svg>
          Continue with Google
        </a>
        <a className="btn wide provider" href="/api/auth/zoho" style={{ marginTop: 8 }}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect width="24" height="24" rx="5" fill="#E42527" />
            <path fill="#fff" d="M6 7h12v2.2L9.4 15.6H18V18H6v-2.2l8.6-6.4H6z" />
          </svg>
          Continue with Zoho
        </a>
      </section>
    </main>
  )
}
