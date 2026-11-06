import { useCallback, useEffect, useState } from 'react'
import AuthStep from './AuthStep'
import { BusinessStep, DoneStep, KeysStep, LeadsStep, PersonaStep } from './Steps'
import { call, type Onboarding } from './api'

// Sign-in and first-run setup as one five-step wizard. The bar starts at 20% (step 1 of 5) and fills as you go.
// Step 1 runs before there is a session; the rest need one. Everything after step 1 can be skipped except choosing a business type.

const STEPS = ['Account', 'Business', 'Keys', 'Persona', 'Leads'] as const
const DONE = STEPS.length + 1

export default function Wizard({ signedIn, onSignedIn, onFinish }: { signedIn: boolean; onSignedIn: () => void; onFinish: () => void }) {
  const [data, setData] = useState<Onboarding | null>(null)
  const [step, setStep] = useState(1)
  const [skipped, setSkipped] = useState<string[]>([])
  const [leadsAdded, setLeadsAdded] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!signedIn) { setStep(1); return }
    call<Onboarding>('/api/onboarding')
      .then((d) => { setData(d); setSkipped(d.progress.skipped); setStep(Math.min(Math.max(d.progress.step, 2), STEPS.length)) })
      .catch((e: Error) => setError(e.message))
  }, [signedIn])

  const save = useCallback((to: number, done = false, skip = skipped) =>
    call('/api/onboarding', { action: 'progress', step: Math.min(to, STEPS.length), done, skipped: skip }).catch(() => undefined), [skipped])

  const next = (skip?: string) => {
    const s = skip ? [...new Set([...skipped, skip])] : skipped
    if (skip) setSkipped(s)
    const to = step + 1
    setStep(to)
    void save(to, false, s)
  }
  const back = () => setStep((s) => Math.max(2, s - 1))
  const finish = async () => { await save(STEPS.length, true); onFinish() }

  const pct = step >= DONE ? 100 : Math.round((step / STEPS.length) * 100)
  const props = data && { data, setData, next, back }

  return (
    <main className="wz-wrap">
      <div className="wz-bar" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="wz-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <section className={'wz-card-shell panel' + (step === 1 ? ' narrow' : '')}>
        <div className="brand" style={{ padding: 0, marginBottom: 16 }}>
          <img src="/logo.svg?v=1" alt="" width={28} height={28} style={{ display: 'block' }} />
          Email Automation
        </div>

        <ol className="wz-steps" aria-label="Setup steps">
          {STEPS.map((label, i) => {
            const n = i + 1
            const state = step >= DONE || n < step ? 'done' : n === step ? 'now' : 'todo'
            const canGo = signedIn && n >= 2 && n < step && step < DONE
            return (
              <li key={label} className={'wz-step ' + state} aria-current={state === 'now' ? 'step' : undefined}>
                <button disabled={!canGo} onClick={() => setStep(n)} aria-label={`Step ${n}: ${label}${state === 'done' ? ', done' : ''}`}>
                  <span className="wz-dot">{state === 'done' ? '✓' : n}</span>
                  <span className="wz-label">{label}</span>
                </button>
              </li>
            )
          })}
        </ol>

        {error && <div className="banner bad" role="alert">{error}</div>}
        {step === 1 && <AuthStep onSignedIn={onSignedIn} />}
        {signedIn && !data && !error && <p className="sub" aria-busy="true">Loading…</p>}
        {props && step === 2 && <BusinessStep {...props} />}
        {props && step === 3 && <KeysStep {...props} />}
        {props && step === 4 && <PersonaStep {...props} />}
        {props && step === 5 && <LeadsStep {...props} onAdded={(n) => setLeadsAdded((c) => c + n)} />}
        {data && step >= DONE && <DoneStep data={data} setData={setData} leadsAdded={leadsAdded} finish={() => void finish()} />}
      </section>
    </main>
  )
}
