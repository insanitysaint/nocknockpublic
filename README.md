# Nocknock cockpit (frontend)

The web app for the Nocknock outreach engine: leads, approvals, sending, replies. It runs on **Vercel** and talks to your own engine (n8n on an Oracle VM, from the `backend` kit). The browser never talks to the engine directly: a small Vercel function checks you are signed in and forwards the request with a private login.

```
Browser --> Vercel (this repo) --/api/n8n--> https://<your server> (Caddy + n8n)
```

## Deploy (about 5 minutes)

1. **Backend first.** Run the installer from the backend kit. It prints the 5 settings below and saves them in `vercel-settings.env` on your server.
2. **Import this repo into Vercel:** vercel.com -> Add New -> Project -> pick this repo. Vercel detects the settings from `vercel.json`; leave the build settings alone.
3. **Paste the 5 settings** before pressing Deploy (Environment Variables; you can paste the whole block from `vercel-settings.env` into the first field and Vercel splits it):

   | Name | Value |
   |---|---|
   | `N8N_BASE_URL` | your server address, `https://...` |
   | `N8N_PROXY_USER` | `vercel` |
   | `N8N_PROXY_PASSWORD` | printed by the installer |
   | `SESSION_SECRET` | printed by the installer |
   | `AUTH_USERS` | printed by the installer (your web-app login) |

4. **Deploy**, open the URL and sign in with the ID and password the installer printed.
5. Open **Send centre** and send yourself a test email before approving any lead.

To add a second person later, run `node scripts/hash-password.mjs sam "Sam Lee" sam@example.com`. It prints one more entry to add inside the brackets of `AUTH_USERS`.

## Local development

```
npm ci
npm run dev
```

`npm run dev` skips the sign-in gate and has no `/api` functions, so the screens show without data unless you proxy `/webhook` to a running engine.

## Notes

- Vercel's free Hobby plan is for personal, non-commercial use. Check Vercel's terms if this becomes a business.
- The screen you land on is `public/cockpit.html`; the React screens are in `src` (add `?ui=react`).
- Optional extras (Google sign-in, Team / AI keys / Lead sources pages) are listed at the bottom of `.env.example`. You do not need them.
