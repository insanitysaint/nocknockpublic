import { useCallback, useEffect, useState } from 'react'
import Nav from '../components/Nav'
import { useAuth } from '../lib/auth'
import { getOrg, setOrg } from '../lib/org'

type Role = 'owner' | 'manager' | 'viewer'
interface TeamState {
  orgs: { id: string; name: string; role: Role }[]
  org: { id: string; name: string; role: Role; allowed_domain: string | null } | null
  seats?: { limit: number; members: number; pending: number; free: number }
  members?: { user_id: string; email: string; name: string; role: Role }[]
  invites?: { id: string; email: string; role: Role }[]
}

const ROLE_HELP: Record<Role, string> = {
  owner: 'everything, including members',
  manager: 'leads, approvals, sending',
  viewer: 'read only',
}

async function call(method: 'GET' | 'POST', body?: object): Promise<TeamState> {
  const org = getOrg()
  const r = await fetch(method === 'GET' && org ? `/api/team?org=${encodeURIComponent(org)}` : '/api/team', {
    method,
    headers: { 'x-requested-with': 'ea', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  })
  const j = (await r.json().catch(() => ({}))) as TeamState & { error?: string }
  if (!r.ok) throw new Error(j.error || 'Something went wrong.')
  return j
}

export default function Team() {
  const { user } = useAuth()
  const [s, setS] = useState<TeamState | null>(null)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('manager')
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    call('GET').then((j) => { setS(j); setError(''); if (j.org) setOrg(j.org.id) }).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const act = async (body: object): Promise<boolean> => {
    setBusy(true)
    let ok = false
    try { setS(await call('POST', { ...body, org: s?.org?.id })); setError(''); ok = true } catch (e) { setError((e as Error).message) }
    setBusy(false)
    return ok
  }

  const owner = s?.org?.role === 'owner'

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 16px' }}>
      <Nav view="team" title={s?.org?.name} />
      <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>Team</h1>
      {s?.members && s.members.length === 1 && s.invites?.length === 0 && (
        <p className="sub" style={{ marginTop: 0 }}>It is just you for now. Adding teammates is optional; everything works on your own.</p>
      )}

      {error && <div className="banner bad" role="alert">{error}</div>}
      {s && s.orgs.length > 1 && (
        <label className="sub" style={{ display: 'block', marginBottom: 12 }}>Workspace{' '}
          <select className="input" value={s.org?.id} onChange={(e) => { setOrg(e.target.value); location.reload() }}>
            {s.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}

      {s?.org && s.seats && s.members && s.invites && (
        <>
          <section className="panel">
            <div className="ph">
              <h2>Seats</h2>
              <span className="sub">{s.seats.members + s.seats.pending} of {s.seats.limit} used{s.seats.pending ? ` (${s.seats.pending} invited)` : ''}</span>
            </div>
            <table className="t">
              <thead><tr><th>Person</th><th>Role</th><th /></tr></thead>
              <tbody>
                {s.members.map((m) => (
                  <tr key={m.user_id}>
                    <td className="co">{m.name || m.email}<div className="sub">{m.email}</div></td>
                    <td>
                      {owner ? (
                        <select className="input" aria-label={`Role for ${m.email}`} value={m.role} disabled={busy}
                          onChange={(e) => void act({ action: 'role', user_id: m.user_id, role: e.target.value })}>
                          {(['owner', 'manager', 'viewer'] as Role[]).map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      ) : m.role}
                    </td>
                    <td>{owner && m.email !== user.email && (
                      <button className="btn sm ghost" disabled={busy} onClick={() => { if (confirm(`Remove ${m.email}?`)) void act({ action: 'remove', user_id: m.user_id }) }}>Remove</button>
                    )}</td>
                  </tr>
                ))}
                {s.invites.map((i) => (
                  <tr key={i.id}>
                    <td className="co">{i.email}<div className="sub">Invited, waiting for first sign-in</div></td>
                    <td>{i.role}</td>
                    <td><button className="btn sm ghost" disabled={busy} onClick={() => void act({ action: 'revoke', id: i.id })}>Cancel</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {owner ? (
            <section className="panel" style={{ marginTop: 16 }}>
              <div className="ph">
                <h2>Invite someone</h2>
                <span className="sub">They sign in with Zoho or Google using this email{s.org.allowed_domain ? `, @${s.org.allowed_domain} only` : ''}</span>
              </div>
              <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 12 }}
                onSubmit={(e) => { e.preventDefault(); void act({ action: 'invite', email, role }).then((ok) => { if (ok) setEmail('') }) }}>
                <input className="input" type="email" required placeholder="name@company.com" aria-label="Email" value={email}
                  onChange={(e) => setEmail(e.target.value)} style={{ flex: '1 1 220px' }} />
                <select className="input" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  {(['manager', 'viewer', 'owner'] as Role[]).map((r) => <option key={r} value={r}>{r}: {ROLE_HELP[r]}</option>)}
                </select>
                <button className="btn" disabled={busy || s.seats.free <= 0}>Invite</button>
              </form>
              {s.seats.free <= 0 && <p className="sub" style={{ padding: '0 12px 12px' }}>All seats are used. Cancel an invite or remove someone to free one.</p>}
            </section>
          ) : (
            <p className="sub" style={{ marginTop: 16 }}>Only owners can invite people or change roles. You are a {s.org.role}.</p>
          )}
        </>
      )}
    </div>
  )
}
