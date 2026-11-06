import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import Wizard from './Wizard'
import { call, type Onboarding } from './api'

// Customers (not operators) who own a workspace and have not finished setup see the wizard first. Everyone else goes straight in.
// ?view=setup reopens the wizard for anyone who is signed in.
const forced = new URLSearchParams(window.location.search).get('view') === 'setup'

export default function OnboardingGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [show, setShow] = useState<boolean | undefined>(user.operator && !forced ? false : undefined)

  useEffect(() => {
    if (user.operator && !forced) return
    call<Onboarding>('/api/onboarding')
      .then((d) => setShow(forced || (d.role === 'owner' && !d.progress.done)))
      .catch(() => setShow(false))
  }, [user.operator])

  if (show === undefined) return <div className="login-wrap" aria-busy="true" />
  if (show) return <Wizard signedIn onSignedIn={() => undefined} onFinish={() => { window.location.replace(window.location.pathname) }} />
  return <>{children}</>
}
