# Chika's Game Hub

An educational gaming platform for children ages 4–12. Parents register with verifiable
guardian consent (COPPA), children sign in with generated usernames, and a personalised
dashboard recommends games by age, reading level and learning goals.

## Stack

| Layer     | Tech                                                        |
| --------- | ----------------------------------------------------------- |
| Frontend  | Vite + TypeScript, hand-rolled CSS design system, Vitest    |
| Gateway   | Node HTTP server: static files, `/api` reverse proxy        |
| Backend   | NestJS + Express, class-validator, Cloud Firestore       |
| Tests     | Jest (backend), Vitest (frontend), `node:test` (gateway)     |

Monorepo via npm workspaces: `frontend/`, `gateway/`, `backend/`.

## Quick start

```bash
npm install
npm run dev          # api (:3001) + gateway (:3000) + vite (:5173)
```

Open <http://localhost:5173> (Vite) or <http://localhost:3000> (gateway serving built assets).

## Scripts

| Command                        | What it does                                             |
| ------------------------------ | -------------------------------------------------------- |
| `npm run dev`                  | Run all three workspaces in watch mode                   |
| `npm run build`                | Typecheck + build backend, frontend and gateway          |
| `npm run typecheck`            | `tsc --noEmit` for every workspace                       |
| `npm run test`                 | Backend (151) + frontend (50) + gateway (4) tests         |
| `npm start`                    | Production start of the gateway (serves `frontend/dist`)  |
| `npm run start:api`            | Production start of the backend only                     |
| `powershell -File scripts/smoke.ps1` | End-to-end smoke test (20 assertions, boots fresh servers) |

## Architecture

```
browser ──> gateway :3000 ──┬── static: frontend/dist (HTML/CSS/JS, fonts, SVG)
                            └── /api/* ──> backend :3001 (NestJS, Firestore)
```

- **Gateway** serves the four HTML entry points (`/`, `/login`, `/register`, `/dashboard`),
  proxies `/api` to the backend, adds security headers, and answers with a typed
  `{success:false,error:{...}}` envelope when the backend is down.
- **Backend** exposes `/api/auth/*`, `/api/dashboard`, `/api/game/*`, `/api/games` with a
  uniform response envelope, JWT-less bearer sessions (hashed tokens in Firestore), rate
  limiting and COPPA consent enforcement.
- **Frontend** is four pages sharing `src/core` (API client, session, local progress
  storage, offline catalogue fallback, validation mirror) plus `src/game` (the game
  runtime and level generators).

## Project layout

```
backend/src/
  auth/        registration, confirm/deny, login, logout, sessions
  dashboard/   personalised payload for the game dashboard
  game/        catalogue, filtering/ranking rules, event + progress services
  database/    DataStore abstraction (MemoryStore + FirestoreStore)
  common/      error envelope, validation, rate limit, session guard
frontend/src/
  core/        api, session, storage, catalog, validate, modal, toast, ...
  pages/       landing, register, login, dashboard controllers
  game/        game runtime + per-genre level generators
  styles/      base design system + per-page styles
gateway/src/   static server + API proxy
scripts/       smoke.ps1 end-to-end test
docs/          API, database, local storage, privacy, deployment, live deployment
```

## Documentation

- [API reference](docs/api.md)
- [Database schema](docs/database.md)
- [Browser local storage](docs/local-storage.md)
- [Privacy & COPPA](docs/privacy-coppa.md)
- [Setup & deployment](docs/deployment.md)
- [Live deployment (GitHub + Netlify + App Hosting)](docs/deployment-live.md)

## Verification

```bash
npm run typecheck && npm run test && npm run build
powershell -File scripts/smoke.ps1     # requires a prior `npm run build`
```

Test totals: 151 backend (unit + `test/api.e2e-spec.ts` integration; 6 Firestore-emulator
tests skip unless `FIRESTORE_EMULATOR_HOST` is set), 50 frontend, 4 gateway.
