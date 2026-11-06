import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { StoreProvider } from './lib/store'
import { AuthGate, useAuth } from './lib/auth'
import { ToastProvider } from './components/ui'
import Classic from './pages/Classic'
import Team from './pages/Team'
import OnboardingGate from './onboarding/Gate'
import { AiKeys, LeadSources } from './pages/Integrations'
import './styles.css'

// The original cockpit is the default. Add ?ui=react to the address to see the rebuilt React screens instead.
const useReactUi = new URLSearchParams(window.location.search).get('ui') === 'react'
// ?view=team, ?view=ai and ?view=sources open the company pages for anyone. Customers (a company seat, not an operator) only ever get those.
const view = new URLSearchParams(window.location.search).get('view')

function Root() {
  const { user } = useAuth()
  if (view === 'ai') return <AiKeys />
  if (view === 'sources') return <LeadSources />
  if (view === 'team' || !user.operator) return <Team />
  return useReactUi ? (
    <StoreProvider>
      <App />
    </StoreProvider>
  ) : (
    <Classic />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthGate>
          <OnboardingGate>
            <Root />
          </OnboardingGate>
        </AuthGate>
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
)
