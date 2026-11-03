import { useAuth } from '../lib/auth'

// Inside the cockpit's pop-up the pages load with ?embed=1.
export const EMBED = new URLSearchParams(window.location.search).get('embed') === '1'

export type View = 'team' | 'ai' | 'sources'
const TABS: [View, string][] = [['team', 'Team'], ['ai', 'AI keys'], ['sources', 'Lead sources']]

// Header shared by the company pages (Team, AI keys, Lead sources).
export default function Nav({ view, title }: { view: View; title?: string }) {
  const { user, signOut } = useAuth()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
      {user.operator && !EMBED && <a className="btn sm" href="/">Cockpit</a>}
      {TABS.map(([v, label]) => (
        <a key={v} className={`btn sm${v === view ? '' : ' ghost'}`} href={`/?view=${v}${EMBED ? '&embed=1' : ''}`} aria-current={v === view ? 'page' : undefined}>{label}</a>
      ))}
      <span className="sub" style={{ marginLeft: 8 }}>{title}</span>
      <span style={{ flex: 1 }} />
      {!EMBED && <button className="btn sm ghost" onClick={() => void signOut()}>Sign out</button>}
    </div>
  )
}
