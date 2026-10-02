# Setup & deployment

## Prerequisites

- Node.js ≥ 20.11 (tested on 24.x)
- npm ≥ 10 (workspaces)

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

Runs three watchers concurrently:

| Process  | Port | Notes |
| -------- | ---- | ----- |
| backend  | 3001 | `node --watch --require ts-node/register/transpile-only src/main.ts` |
| gateway  | 3000 | proxies `/api` → backend; serves `frontend/dist`, or proxies to Vite in dev |
| frontend | 5173 | Vite dev server, proxies `/api` → gateway |

Browse <http://localhost:5173> during development or <http://localhost:3000>.

Storage uses the in-memory `MemoryStore` by default (data resets on restart). Set
`DATA_STORE=firestore` to persist to Cloud Firestore — see [database](database.md) and
the [live deployment guide](deployment-live.md).

## Build

```bash
npm run build       # backend (tsc) + frontend (tsc --noEmit && vite build) + gateway (tsc)
```

## Production

```bash
npm run build
npm run start:api &        # backend on :3001
npm start                  # gateway on :3000 (serves frontend/dist + proxies /api)
```

If the gateway runs on the same host as the backend, only `PORT`/`API_TARGET` may need
overriding. Otherwise expose the backend privately and point `API_TARGET` at it.

## Environment variables

### Backend (`backend`)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `NODE_ENV` | `development` | environment flag |
| `PORT` | `3001` | API listen port |
| `API_PREFIX` | `api` | global route prefix |
| `DATA_STORE` | `memory` | `memory` (local/tests) \| `firestore` (required in production) |
| `FIRESTORE_SERVICE_ACCOUNT` | — | service-account JSON (required for `firestore` outside Google Cloud, e.g. Railway) |
| `SESSION_TTL_HOURS` | `24` | session lifetime |
| `PENDING_TTL_MINUTES` | `30` | registration confirm window |
| `CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | comma-separated allow-list |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy (correct client IPs for rate limiting) |
| `RL_WINDOW_MS` | `60000` | rate-limit window |
| `RL_AUTH_MAX` | `20` | auth requests per window per IP |
| `RL_EVENT_MAX` | `300` | gameplay events per window per IP |

### Gateway (`gateway`)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `PORT` | `3000` | HTTP listen port |
| `API_TARGET` | `http://localhost:3001` | backend upstream for `/api` |
| `FRONTEND_DIR` | `frontend/dist` | static files root |
| `DEV_TARGET` | `http://localhost:5173` | Vite upstream when `frontend/dist` is missing |

### Frontend (`frontend`)

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `VITE_API_BASE` | `/api` (same-origin) | backend origin or full API base at build time when the API is cross-origin (e.g. `https://<backend>.up.railway.app`) |

## Smoke test

```bash
npm run build
powershell -ExecutionPolicy Bypass -File scripts/smoke.ps1
```

Boots a fresh backend (in-memory store) + the gateway serving `frontend/dist`, then asserts
20 checks: static pages, catalogue, validation rejection, full register → confirm → dashboard →
event → progress → logout flow, revoked-token 401, and the exact login failure message.
Ports 3000/3001 must be free (the script frees them) and `npm run build` must have run.

## Verification gates

```bash
npm run typecheck && npm run test && npm run build
```

- backend: Jest (151 tests — 122 unit + 29 integration in `test/api.e2e-spec.ts`; 6
  Firestore-emulator tests skip unless `FIRESTORE_EMULATOR_HOST` is set)
- frontend: Vitest (50 tests)
- gateway: `node:test` (4 tests)

## Notes for production hardening

- Terminate TLS upstream; set `TRUST_PROXY=true` so rate limits see real client IPs.
- Keep `frontend/dist` and `gateway/dist` on the gateway host; sync via your CI.
- Back up Firestore securely (console export or scheduled backups) — it contains consent
  records.
- The gateway already sends security headers and a typed 502 envelope; put it behind
  a conventional reverse proxy (nginx/Caddy) for TLS and gzip if needed.
- For the managed live setup (GitHub + Railway + Cloud Firestore), follow the
  [live deployment guide](deployment-live.md).
