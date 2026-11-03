// The original cockpit page (public/cockpit.html), shown full-window behind the sign-in gate.
// It talks to the engine through the same /webhook/* paths, which the Vercel proxy secures.
export default function Classic() {
  return (
    <iframe
      src="/cockpit.html"
      title="Cockpit"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0, background: '#181818' }}
    />
  )
}
