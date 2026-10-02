# Live deployment: GitHub + Railway + Cloud Firestore

The production architecture is two Railway services built from this one repo,
plus Cloud Firestore for data:

```
browser
  └── https://<frontend>.up.railway.app      Railway "frontend": Railpack builds
        │                                      frontend/dist, serves it with Caddy
        │  cross-origin fetch (VITE_API_BASE)
        └── https://<backend>.up.railway.app  Railway "backend": NestJS API
                                               └── Cloud Firestore (service-account auth)
```

- The frontend and backend are **separate origins**: the browser calls the API at
  `VITE_API_BASE`, and the backend allows that origin via `CORS_ORIGINS`.
- The gateway runs **only in local development**. On Railway, static serving and
  the API are each handled by their own service.
- Railway injects `PORT` automatically — both `backend` (Nest) and Railpack's Caddy
  honour it, so no port settings are needed.

Repo configuration involved (all in the repository):

| File | Role |
| ---- | ---- |
| `apphosting.yaml`, `netlify.toml` | **removed** — previous platform was Netlify + Firebase App Hosting |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json`, `.firebaserc` | Firestore rules + emulator config (still used) |
| `frontend/src/core/api.ts` | reads `VITE_API_BASE` at build time |

Service settings (build/start commands, healthchecks) live in the Railway
dashboard — Railway's file-based config (`railway.json`) is deprecated for new
services. An optional newer alternative is Infrastructure as Code
(`.railway/railway.ts` + `railway config apply`); this guide uses the dashboard.

## Prerequisites

- Node.js 24.x and npm ≥ 11 locally
- A [GitHub](https://github.com) account with this repo pushed
- A [Railway](https://railway.com) account — **a paid plan is required**
  (Railway has no free tier; the Hobby plan is the minimum)
- A [Firebase](https://console.firebase.google.com) project on the **Blaze** plan
  for Cloud Firestore (storage/reads have generous free quotas; watch billing the
  first days)
- Firebase CLI: `npm install -g firebase-tools`

## Step 0 — Verify the local gates first

```bash
npm install
npm run typecheck && npm run test && npm run build
```

Optional (needs free ports 3000/3001):

```bash
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
```

Do not push a commit that fails these gates — Railway builds from the repo.

## Step 1 — Push to GitHub

```bash
git add .
git commit -m "Railway deployment setup"
git push origin main
```

## Step 2 — Firebase project, Firestore, service account

1. [Firebase console](https://console.firebase.google.com) → **Add project**
   (e.g. `chikas-game-hub`).
2. **Upgrade to Blaze** (Plan → Upgrade) — required for Cloud Firestore databases.
3. **Build → Firestore Database → Create database** → **Native mode** → pick a
   region close to your users (ideally the same region as the Railway services).
4. Authenticate the CLI and select the project:

   ```bash
   firebase login
   firebase use --add          # pick the project, alias it e.g. "live"
   ```

5. Deploy the deny-all security rules:

   ```bash
   firebase deploy --only firestore
   ```

   The rules block every client SDK; only the backend's Admin SDK touches data.
6. **Create the service-account key** the backend will use on Railway:
   Project settings → **Service accounts** → **Generate new private key**.
   Save the downloaded JSON file — its entire contents become the
   `FIRESTORE_SERVICE_ACCOUNT` variable in Step 4. Keep it secret; you can
   rotate it at any time from the same screen.

## Step 3 — Create the Railway project and both services

1. [railway.com/new](https://railway.com/new) → **Deploy from GitHub repo** →
   select this repository. Railway creates your project with a first service —
   name it **`backend`**.
2. Add the second service: **Create → Service → GitHub repo** → same repository →
   name it **`frontend`**.
3. Configure **backend → Settings**:

   | Setting | Value |
   | ------- | ----- |
   | Root Directory | `/` (repo root — monorepo, leave default) |
   | Build Command | `npm run build -w backend` |
   | Start Command | `npm run start:api` |
   | Healthcheck Path | `/api/games` |
   | Region | e.g. `us-west2` — pick one close to you |

4. Configure **frontend → Settings**:

   | Setting | Value |
   | ------- | ----- |
   | Root Directory | `/` |
   | Build Command | `npm run build -w frontend` |
   | Start Command | *(leave empty — Railpack serves the static build with Caddy)* |
   | Healthcheck Path | `/` |
   | Region | same region as `backend` |

5. Generate a public domain for **both** services:
   **Settings → Networking → Public Networking → Generate Domain**. Copy them:
   - frontend: `https://<frontend>.up.railway.app`
   - backend: `https://<backend>.up.railway.app`

## Step 4 — Environment variables

### frontend → Variables

| Variable | Value |
| -------- | ----- |
| `RAILPACK_SPA_OUTPUT_DIR` | `frontend/dist` — forces Railpack's static (Caddy) mode on that directory |
| `VITE_API_BASE` | `https://<backend>.up.railway.app` (or `.../api` — both work) |

`VITE_API_BASE` is read **at build time** — after changing it, make sure the
frontend service redeploys (Railway usually does this automatically; otherwise
click **Redeploy**).

### backend → Variables

| Variable | Value |
| -------- | ----- |
| `DATA_STORE` | `firestore` |
| `TRUST_PROXY` | `true` — rate limits see real client IPs behind Railway's proxy |
| `CORS_ORIGINS` | `https://<frontend>.up.railway.app` (exactly this origin, no trailing slash) |
| `FIRESTORE_SERVICE_ACCOUNT` | paste the **entire contents** of the service-account JSON from Step 2.6 |

Notes:

- **Do not set `NODE_ENV`.** Railway's builder (Railpack) runs the container with
  `NODE_ENV=production` itself; setting it manually can break the dependency
  install step (devDependencies such as `typescript` would be skipped).
- The backend refuses to boot if `NODE_ENV=production` without
  `DATA_STORE=firestore`, and logs a warning when `CORS_ORIGINS` is missing —
  both guardrails are in the code.
- Setting a variable triggers a redeploy; if a build-time variable seems stale,
  redeploy manually.

## Step 5 — Verification checklist

- [ ] `https://<frontend>.up.railway.app/` renders the landing page.
- [ ] `/login.html` and `/register.html` load (note: links use explicit `.html`
      paths, which the static server handles natively).
- [ ] Register a real guardian account → confirmation flow → dashboard.
- [ ] In the browser DevTools **Network** tab, API requests go to the
      **backend** domain (from `VITE_API_BASE`) and return 200 — no CORS errors
      in the console.
- [ ] `https://<backend>.up.railway.app/api/games` returns the catalogue JSON
      directly.
- [ ] Login → play → logout → login: progress persists (round-trip through
      Firestore).
- [ ] **backend → Deploy Logs** are clean; the healthcheck passed (deployment
      shows green, not rolling back).
- [ ] Intentionally wrong path (`/nope`) returns a 404/SPA fallback, not a crash.

## Step 6 — Day-to-day deploys

- **Push to `main`** → Railway auto-deploys both services (GitHub integration).
- After changing variables (especially `VITE_API_BASE`), redeploy if Railway
  doesn't do it for you.
- **Rules/indexes**: edit `firestore.rules` / `firestore.indexes.json` →
  `firebase deploy --only firestore`.
- Optional: set **Watch Paths** per service so backend-only changes don't rebuild
  the frontend (e.g. backend: `backend/**`, `package*.json`; frontend:
  `frontend/**`, `package*.json`). Patterns are evaluated from the repo root.
- Optional: Railway can manage the whole project from one `.railway/railway.ts`
  file (`railway config init` / `railway config apply` with the Railway CLI).

## Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| Browser console: CORS error | `CORS_ORIGINS` missing or not the exact frontend origin (scheme + host, no trailing slash). |
| API requests 404 on the frontend domain | `VITE_API_BASE` unset — the frontend falls back to same-origin `/api`, which the static server doesn't serve. Set the variable and redeploy. |
| Frontend blank / old bundle | Stale build: `VITE_API_BASE` changed after the last build — redeploy the frontend service. |
| Backend boot error `DATA_STORE=firestore is required…` | `DATA_STORE` variable missing on the backend service. |
| Backend boot error `FIRESTORE_SERVICE_ACCOUNT is not valid JSON…` | JSON pasted with truncation/extra text — paste the key file contents exactly; re-download if unsure. |
| Backend boot error `Failed to initialise Cloud Firestore…` | Key revoked (rotate in Firebase), wrong project, or variable missing. |
| Build fails: `tsc: command not found` / missing typescript | `NODE_ENV=production` was set manually and pruned devDependencies — remove it. |
| Deployment 502 "application failed to respond" | App didn't bind Railway's `PORT`, or crashed — check Deploy Logs. If the port looks wrong, verify the healthcheck path matches your routes. |
| Rate limiting blocks a shared office NAT (429) | Expected per-IP behaviour; tune `RL_AUTH_MAX` / `RL_EVENT_MAX` on the backend if needed. |
| Registration works but confirmation link wrong | Email links are built from the origin the request arrived on — test the flow through the final frontend domain. |

## Custom domains

Both services support custom domains (Settings → Networking → Networking → Custom
Domain, with the CNAME/TXT records Railway gives you). If the frontend moves to
`https://play.example.com`, update **both** `CORS_ORIGINS` (backend) and, if the
API also moves, `VITE_API_BASE` (frontend) — then redeploy.

## Local parity with production

```bash
# terminal 1 — Firestore emulator
firebase emulators:start --only firestore

# terminal 2 — backend against the emulator
DATA_STORE=firestore FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=demo-chika npm run dev
```

or plain in-memory dev (default): `npm run dev` (gateway on :3000, API on :3001,
Vite on :5173). The six Firestore parity tests
(`backend/src/database/firestore.store.spec.ts`) run automatically when
`FIRESTORE_EMULATOR_HOST` is set and skip otherwise.

## Why the previous setup was replaced

The Netlify + Firebase App Hosting configuration (`netlify.toml`,
`apphosting.yaml`) was removed when the platform moved to Railway. The current
equivalents:

| Concern | Netlify + App Hosting | Railway |
| ------- | --------------------- | ------- |
| Frontend hosting | Netlify static + `/api` proxy | Railpack static mode (Caddy) on the `frontend` service |
| API URL coupling | same-origin (proxy) | `VITE_API_BASE` + `CORS_ORIGINS` (cross-origin) |
| Backend runtime | App Hosting (Cloud Run) | Railway `backend` service, `PORT` injected |
| Build/start config | versioned in repo files | Railway dashboard (per-service settings) |
| Data | Cloud Firestore | Cloud Firestore (unchanged, via `FIRESTORE_SERVICE_ACCOUNT`) |
