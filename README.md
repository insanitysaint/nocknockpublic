# Nocknock cockpit (frontend)

The web app for the Nocknock outreach engine: leads, approvals, sending, replies. It runs on **Vercel** and talks to your own engine (n8n on an Oracle VM, from the `backend` kit). The browser never talks to the engine directly: a small Vercel function checks you are signed in and forwards the request with a private login.

```
Browser --> Vercel (this repo) --/api/n8n--> https://<your server> (Caddy + n8n)
```

## Deploy

1. **Backend first.** Set up the engine from the backend kit and note its address and the `vercel` password printed by `scripts/make-env.sh`.
2. **Import this repo into Vercel.** vercel.com -> Add New -> Project -> pick this repo. Framework "Vite" is detected from `vercel.json`; leave the build settings alone.
3. **Environment variables.** Add everything in `.env.example` (Production). Make your login with `node scripts/hash-password.mjs me "Your Name" you@example.com` and put the printed JSON inside `AUTH_USERS=[ ... ]`.
4. **Deploy**, open the URL, sign in with the ID and password you hashed.
5. Open **Send centre** and send yourself a test email before approving any lead.

Change a variable -> Vercel redeploys on the next push, or press Redeploy.

## Local development

```
npm ci
npm run dev
```

`npm run dev` skips the sign-in gate and has no `/api` functions, so the screens show without data unless you proxy `/webhook` to a running engine.

## Notes

- Vercel's free Hobby plan is for personal, non-commercial use. Check Vercel's terms if this becomes a business.
- The screen you land on is `public/cockpit.html`; the React screens are in `src` (add `?ui=react`).
- `public/cockpit.html` still contains the original author's sample email copy in its "copy drafts" panel. It is display only: what is actually sent comes from your backend `profile.json`.
