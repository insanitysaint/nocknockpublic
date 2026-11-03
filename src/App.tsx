import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Icon } from './components/ui'
import { queueOf } from './lib/domain'
import { useAuth } from './lib/auth'
import { useStore } from './lib/store'
import Overview from './pages/Overview'
import Pipeline from './pages/Pipeline'
import Send from './pages/Send'
import Campaigns from './pages/Campaigns'
import Upload from './pages/Upload'
import Replies from './pages/Replies'
import Notes from './pages/Notes'
import Settings from './pages/Settings'
import { ErrorBoundary } from './components/ErrorBoundary'

export default function App() {
  const { state, ck, sentByEmail, error, loading, updatedAt, refresh } = useStore()
  const { user, signOut } = useAuth()
  const leads = state?.leads ?? []
  const review = leads.filter((l) => l.status === 'review' && l.email).length
  const queued = queueOf(leads, sentByEmail).length
  const replies = ck?.replies.length ?? 0

  const nav: [string, string, string, number?][] = [
    ['/', 'Overview', 'overview'],
    ['/pipeline', 'Pipeline', 'pipeline', review],
    ['/send', 'Send', 'send', queued],
    ['/campaigns', 'Campaigns', 'campaigns'],
    ['/upload', 'Upload leads', 'upload'],
    ['/replies', 'Replies', 'replies', replies],
    ['/notes', 'Notes', 'notes'],
    ['/settings', 'Settings', 'settings'],
  ]

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="logo"><Icon name="mail" /></span>
          Email Automation
        </div>
        <nav className="nav" aria-label="Main">
          {nav.map(([to, label, icon, n]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon name={icon} />{label}
              {n ? <span className="count">{n}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="foot">
          <button className="btn sm" onClick={() => void refresh()}><Icon name="refresh" />Refresh</button>
          <div style={{ marginTop: 8 }}>
            {updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}
          </div>
          <div className="user">
            {user.picture && <img src={user.picture} alt="" referrerPolicy="no-referrer" />}
            <span title={user.email}>{user.email}</span>
          </div>
          <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        {error && (
          <div className="banner bad" role="alert">
            {error}
            <span className="spacer" />
            <button className="btn sm" onClick={() => void refresh()}>Retry</button>
          </div>
        )}
        {loading && !state ? <p className="sub">Loading from the n8n engine…</p> : (
          <ErrorBoundary><Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/send" element={<Send />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/upload" element={<Upload />} />
            <Route path="/replies" element={<Replies />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes></ErrorBoundary>
        )}
      </main>
    </div>
  )
}
