# Live deployment: GitHub + Netlify + Firebase App Hosting

The production architecture is three managed pieces — no VPS, no container upkeep:

```
browser
  └── https://<site>.netlify.app            Netlify: static frontend (MPA: index/login/register/dashboard)
        └── /api/* ──proxy (200)──>  https://<backend>.a.run.app    Firebase App Hosting: NestJS API
                                              └── Cloud Firestore     data + consent records
```

- The frontend never talks to the backend's URL directly — Netlify proxies `/api/*` to
  it. Same origin in the browser, so no CORS changes are needed and rate limiting sees
  the real client IP (with `TRUST_PROXY=true`, set in `apphosting.yaml`).
- The gateway is **not** deployed. Netlify performs its two jobs: serve `frontend/dist`
  and proxy `/api`. The backend serves the API only.

Repo config that makes this work (already in the repository):

| File | Role |
| ---- | ---- |
| `netlify.toml` | build command, publish dir, Node 24, `/api` proxy, named routes, headers |
| `apphosting.yaml` | build/run commands, Cloud Run sizing, `NODE_ENV`/`DATA_STORE`/`TRUST_PROXY` |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc` | Firestore rules + emulator config |

## Prerequisites

- Node.js 24.x and npm ≥ 11
- A [GitHub](https://github.com) account
- A [Netlify](https://netlify.com) account (free tier is enough)
- A [Firebase](https://console.firebase.google.com) project on the **Blaze** plan
  (App Hosting requires Blaze; a small app like this typically stays within the
  monthly free allowances — watch the billing console the first days)
- Firebase CLI: `npm install -g firebase-tools`
- Git installed and on `PATH`

All commands below run from the repo root.

## Step 0 — Verify the local gates first

```bash
npm install
npm run typecheck && npm run test && npm run build
```

Optional but recommended (needs free ports 3000/3001):

```bash
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
```

Do not push a commit that fails these gates — both hosts build from the repo.

## Step 1 — Push to GitHub

```bash
git init
git config user.name  "Your Name"          # or use --global
git config user.email "you@example.com"
git add .
git commit -m "Chika's Game Hub"
```

Create an empty repository on github.com (private recommended), then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

## Step 2 — Firebase project, Firestore, CLI wiring

1. [Firebase console](https://console.firebase.google.com) → **Add project**
   (e.g. `chikas-game-hub`) → disable Google Analytics if you don't need it.
2. **Upgrade to Blaze** (Plan → Upgrade) — required by App Hosting.
3. **Build → Firestore Database → Create database** → **Native mode** → pick a region
   close to your users and close to the App Hosting region you'll choose in Step 4.
4. Authenticate the CLI and select the project:

   ```bash
   firebase login
   firebase use --add          # pick the project, give it an alias such as "live"
   ```

   This rewrites `.firebaserc` locally with your real project ID (keep it out of
   forks' way if the repo is public — the ID itself is not a secret, but you can also
   edit `.firebaserc` by hand).
5. Deploy the deny-all security rules:

   ```bash
   firebase deploy --only firestore
   ```

   These rules block every client SDK from the database; only the backend's Admin SDK
   (which bypasses rules) touches data. Verify in the console: rules tab shows the
   deny-all rule.

## Step 3 — Backend on Firebase App Hosting

1. Firebase console → **Hosting & Serverless → App Hosting → Create backend**.
2. Connect GitHub: authorize the Firebase GitHub app; pick your repository and `main`
   as the live branch.
3. Configure deployment settings:
   - **Region**: closest to your users (and ideally to your Firestore region).
   - **Root directory**: `/` (repo root — this is a monorepo; the workspace flags
     `npm run build -w backend` / `npm run start:api` are already in `apphosting.yaml`).
   - Don't add framework presets — App Hosting should see a plain Node app.
4. Review → **Deploy**. The first rollout takes a few minutes
   (`npm install` across all workspaces + `tsc`).
5. When it goes live, copy the backend URL, e.g.
   `https://chikas-game-hub-abc123-uc.a.run.app`.
6. Smoke it directly:

   ```
   https://<backend>/api/games
   ```

   You must get the catalogue JSON envelope. If you get a boot error, open
   **App Hosting → your backend → Rollout → logs**.

The backend reads `apphosting.yaml` from the repo root on every rollout — build
commands and environment (`NODE_ENV=production`, `DATA_STORE=firestore`,
`TRUST_PROXY=true`) are versioned, not console state.

## Step 4 — Frontend on Netlify

1. [Netlify app](https://app.netlify.com) → **Add new site → Import an existing
   project → GitHub** → pick the repository.
2. The build settings come from `netlify.toml` (verify, don't change):
   - Build command: `npm run build -w frontend`
   - Publish directory: `frontend/dist`
   - Node version: `24`
3. **Before the site can work, edit `netlify.toml`**: replace `YOUR_BACKEND_URL` in
   the `/api/*` redirect with the Step 3 host — host only, no `https://`, no path:

   ```toml
   to = "https://chikas-game-hub-abc123-uc.a.run.app/api/:splat"
   ```

   Commit and push; Netlify redeploys automatically:

   ```bash
   git add netlify.toml
   git commit -m "Point /api proxy at App Hosting backend"
   git push
   ```

4. Open the site URL Netlify assigned you.

## Step 5 — Verification checklist

Work through this once on every environment change:

- [ ] `https://<site>/` renders the landing page.
- [ ] `https://<site>/login` and `/register` render (extension-less routes via
      `netlify.toml` rules) — check the Network tab: document request is 200, not a
      redirect loop.
- [ ] Register a real guardian account → confirmation email flow → dashboard.
- [ ] Login, play, progress persists across logout/login (round-trips through the
      proxy to Firestore).
- [ ] `https://<site>/api/games` returns JSON **through the proxy** (the request URL
      must be the Netlify domain, not the backend domain).
- [ ] Event logging: dashboard shows recent activity.
- [ ] Backend logs are clean: App Hosting → Rollouts → logs.
- [ ] A deliberately wrong path (e.g. `/nope`) returns 404, not a blank page.

## Step 6 — Day-to-day deploys

- **Frontend or backend change**: push to `main` → both Netlify and App Hosting
  auto-deploy. Backend-only changes don't need a Netlify build and vice versa
  (Netlify only rebuilds when the frontend/workspace files change; you can always
  trigger a manual **Deploy preview**).
- **Rules or indexes**: edit `firestore.rules` / `firestore.indexes.json`, then
  `firebase deploy --only firestore`.
- **Backend sizing/env**: edit `apphosting.yaml` and push — no console drift.
  (Console-set variables override the file; prefer the file so deploys are
  reproducible.)

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| Site loads, but `/api/...` returns Netlify 404 | `YOUR_BACKEND_URL` still placeholder, or the edit wasn't pushed/redeployed. |
| `/api/...` returns 502 | Backend down or URL wrong → App Hosting logs. First rollout may still be building. |
| Backend refuses to boot: `DATA_STORE=firestore is required in production` | `env` entry missing/overridden — check console variables vs. `apphosting.yaml`. |
| Backend build fails with "Cannot find module 'typescript'" | `NODE_ENV=production` leaked into BUILD availability — devDependencies must install during build. Keep `availability: [RUNTIME]`. |
| Registration/emails fine locally, `PERMISSION_DENIED` live | Firestore rules/database not created in this project — re-run Step 2. |
| Rate limiting blocks a whole office NAT | Expected per-IP behaviour; tune `RL_*` in `apphosting.yaml` if needed. Behind the proxy the client IP is correct because `TRUST_PROXY=true`. |
| Named route loops (`/login` ↔ `/login.html`) | Netlify Pretty URL conflict — keep the three `[[redirects]]` rules; they win because they're shadowed correctly (200 rewrite to an existing file terminates). |
| Works on the deploy preview but not production | You edited `netlify.toml` only on a branch — merge to `main`. |

## Custom domains

- **Netlify**: Domain management → Add a domain → follow DNS steps (or buy through
  Netlify). HTTPS is automatic.
- **Backend**: not needed publicly — only Netlify proxies to it. If you add a custom
  API domain anyway, also add it to `CORS_ORIGINS`… you don't: same-origin via the
  proxy keeps CORS out of the picture entirely.

## Alternative: same stack without Netlify

If you'd rather host only on Google: deploy the built frontend with
`firebase deploy --only hosting` (classic Firebase Hosting, `firebase.json` would
gain a `hosting` block) and use a rewrite instead of `netlify.toml`:

```json
"hosting": {
  "public": "frontend/dist",
  "rewrites": [{ "source": "/api/**", "run": { "serviceId": "...", "region": "..." } }]
}
```

App Hosting's own docs cover [monorepos](https://firebase.google.com/docs/app-hosting/monorepos);
the Netlify route above is chosen simply because static MPA hosting + a proxy is a
first-class Netlify feature.

## Local parity with production

```bash
DATA_STORE=firestore FIRESTORE_EMULATOR_HOST=localhost:8080 npm run dev
```

with the emulator running (`firebase emulators:start --only firestore`). Six backend
tests are written against the emulator and skip automatically when it isn't running
(see `backend/test/firestore.store.spec.ts`).
