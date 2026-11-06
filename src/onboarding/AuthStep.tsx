import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiFail, call, type AuthConfig } from './api'

const MESSAGES: Record<string, string> = {
  denied: 'That account is not allowed to use this app.',
  cancelled: 'Sign-in was cancelled.',
  unverified: 'That provider did not return a verified email address.',
  state: 'The sign-in session expired. Please try again.',
  token: 'Sign-in failed. Please try again.',
  captcha: 'Please complete the robot check first.',
}

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void }
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptReady: Promise<void> | undefined
function loadTurnstile(): Promise<void> {
  scriptReady ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT; s.async = true
    s.onload = () => resolve(); s.onerror = () => { scriptReady = undefined; reject(new Error('blocked')) }
    document.head.appendChild(s)
  })
  return scriptReady
}

// Cloudflare "I am not a robot". A pass is sent to the server, which sets a signed 10-minute cookie.
function RobotCheck({ siteKey, onPassed, onExpired }: { siteKey: string; onPassed: () => void; onExpired: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let id: string | undefined
    let gone = false
    loadTurnstile().then(() => {
      if (gone || !box.current || !window.turnstile) return
      id = window.turnstile.render(box.current, {
        sitekey: siteKey,
        callback: (token: string) => {
          call('/api/auth/captcha', { token }).then(onPassed).catch((e: Error) => { setErr(e.message); window.turnstile?.reset(id) })
        },
        'expired-callback': onExpired,
        'error-callback': () => setErr('The robot check could not load. Disable ad blockers for this page and reload.'),
      })
    }).catch(() => setErr('The robot check could not load. Disable ad blockers for this page and reload.'))
    return () => { gone = true; if (id) window.turnstile?.remove(id) }
  }, [siteKey, onPassed, onExpired])
  return (
    <div style={{ margin: '14px 0' }}>
      <div ref={box} />
      {err && <div className="banner bad" role="alert" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  )
}

export default function AuthStep({ onSignedIn }: { onSignedIn: () => void }) {
  const [cfg, setCfg] = useState<AuthConfig | null>(null)
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [passed, setPassed] = useState(false)
  const [name, setName] = useState('')
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(MESSAGES[new URLSearchParams(window.location.search).get('error') ?? ''] ?? '')

  useEffect(() => {
    call<AuthConfig>('/api/auth/captcha').then(setCfg).catch(() => setCfg({ captcha: false, site_key: null, signup: false, google: true, zoho: true }))
  }, [])
  const onPassed = useCallback(() => setPassed(true), [])
  const onExpired = useCallback(() => setPassed(false), [])

  // With the robot check switched off (an install that has not set it up) the buttons work as before.
  const checkOn = !!cfg?.captcha
  const ready = !!cfg && (!checkOn || passed)
  const up = mode === 'up'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      await call(up ? '/api/auth/signup' : '/api/auth/password', up ? { email: id, name, password } : { id, password })
      onSignedIn()
    } catch (er) {
      if (er instanceof ApiFail && er.code === 'captcha') setPassed(false)
      setError((er as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div>
      <h1 style={{ marginBottom: 6 }}>{up ? 'Create your account' : 'Welcome back'}</h1>
      <p className="sub" style={{ marginBottom: 14 }}>{up ? 'Sign up with Google, Zoho, or an email and password.' : 'Sign in with Google, Zoho, or your ID and password.'}</p>

      {cfg?.signup && (
        <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
          <button role="tab" aria-selected={!up} className={!up ? 'on' : ''} onClick={() => { setMode('in'); setError('') }}>Sign in</button>
          <button role="tab" aria-selected={up} className={up ? 'on' : ''} onClick={() => { setMode('up'); setError('') }}>Sign up</button>
        </div>
      )}

      {error && <div className="banner bad" role="alert">{error}</div>}

      {checkOn && cfg?.site_key && <RobotCheck siteKey={cfg.site_key} onPassed={onPassed} onExpired={onExpired} />}
      {cfg && !checkOn && <p className="hint" style={{ margin: '0 0 12px' }}>The robot check is not switched on for this site yet.</p>}

      <div className="oauth">
        <a className="btn wide provider" href={ready ? '/api/auth/google' : undefined} aria-disabled={!ready}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.64 4.1-5.35 4.1a5.9 5.9 0 1 1 0-11.8c1.87 0 3.12.8 3.84 1.48l2.6-2.5A9.4 9.4 0 0 0 12 2.5a9.5 9.5 0 1 0 0 19c5.5 0 9.1-3.87 9.1-9.3 0-.62-.07-1.1-.15-1.6z" /></svg>
          {up ? 'Sign up with Google' : 'Continue with Google'}
        </a>
        <a className="btn wide provider" href={ready ? '/api/auth/zoho' : undefined} aria-disabled={!ready}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect width="24" height="24" rx="5" fill="#E42527" /><path fill="#fff" d="M6 7h12v2.2L9.4 15.6H18V18H6v-2.2l8.6-6.4H6z" /></svg>
          {up ? 'Sign up with Zoho' : 'Continue with Zoho'}
        </a>
      </div>

      <div className="or"><span>or use {up ? 'email' : 'an ID or email'}</span></div>

      <form onSubmit={(e) => void submit(e)}>
        {up && (
          <div className="field">
            <label htmlFor="su-name">Your name</label>
            <input id="su-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
        )}
        <div className="field">
          <label htmlFor="su-id">{up ? 'Email' : 'ID or email'}</label>
          <input id="su-id" className="input" type={up ? 'email' : 'text'} autoComplete="username" autoCapitalize="none" spellCheck={false}
            value={id} onChange={(e) => setId(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="su-pw">Password{up ? ' (10 characters or more)' : ''}</label>
          <input id="su-pw" className="input" type="password" autoComplete={up ? 'new-password' : 'current-password'} minLength={up ? 10 : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn primary wide" disabled={busy || !ready || !id || !password || (up && !name)}>
          {busy ? 'Please wait…' : up ? 'Create account' : 'Sign in'}
        </button>
        {checkOn && !passed && <p className="hint" style={{ marginTop: 8, textAlign: 'center' }}>Complete the robot check to continue.</p>}
      </form>
    </div>
  )
}
