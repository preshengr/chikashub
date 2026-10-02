# Privacy & COPPA

Chika's Game Hub is designed for children ages 4–12 and follows a parental-consent-first
model consistent with the US Children's Online Privacy Protection Act (COPPA) and similar
guardian-consent regimes.

## What we collect

| Data | Where | Why |
| ---- | ----- | ----- |
| Guardian name, relationship, email, optional phone | `parents` table | Account ownership, consent record |
| Child first name, age, grade, reading level, learning goals, gameplay style | `children` table | Personalisation of game recommendations |
| Guardian e-signature + date, consent flags | `children` table | Verifiable consent evidence |
| Gameplay events (game id, event type, level, score) | `gameplay_events` + `progress` | Progress tracking and dashboard stats |
| Session token hash | `sessions` | Authentication only (raw tokens are never stored) |
| Progress mirror | browser `localStorage` | Offline play (device-local, clearable) |

No advertising identifiers, no third-party trackers, no behavioural profiling, no precise
location, no contacts/photos/microphone access.

## Consent flow (enforced in code)

1. `POST /auth/register` requires `consent.consentData` (COPPA data-collection consent) and
   `consent.termsConsent`, plus a guardian signature ≥ 3 characters and a valid signature date —
   enforced by DTO validation (400 `VALIDATION_ERROR` otherwise).
2. The account is staged as **pending** with a short window (`PENDING_TTL_MINUTES`, default
   30 minutes) and no session is issued.
3. The guardian explicitly **Accepts** (`POST /auth/register/confirm`, `accept: true`) to
   activate the account and receive a session token, or **Denies** (`accept: false` or
   `POST /auth/register/deny`) to delete the staged record entirely.
4. Pending registrations expire automatically; expired/cleanup paths never activate silently.

## Data minimisation & retention

- Usernames are generated (`[a-z]{3}\d{5}`) — no email address is ever used as a login.
- Passwordless design means no passwords to store or leak.
- Deny/expiry removes staged registrations (`pending_registrations`, and their
  `usernames`/`children` rows via cascade).
- Logout revokes the session token; browser reset clears local progress.

## Browser-side

- All fonts are bundled locally (`@fontsource/*`) — **no external CDN/font requests**.
- No external analytics or scripts. The landing-page newsletter form is a local preview
  placeholder and sends nothing over the network.
- `localStorage` data stays on the device and can be wiped from the Login page
  ("Reset progress", two-step confirmation) or the dashboard storage panel.

## Security controls

- Bearer tokens are random, high-entropy values; only their SHA-256 hashes are persisted.
- Uniform error envelopes avoid leaking whether a username exists except for the mandated
  product-spec login message.
- Per-IP rate limiting on auth and gameplay-event routes.
- Gateway strips hop-by-hop headers, adds security headers, and never exposes backend errors.
- SQL is parameterised throughout (better-sqlite3); schema constraints (`CHECK`, `FK`) as a
  second line of defence.

## Operator checklist

- Run behind HTTPS in production (terminate TLS at the reverse proxy).
- Set `SESSION_TTL_HOURS`, `PENDING_TTL_MINUTES` and `CORS_ORIGINS` deliberately.
- Back up `CHIKA_DB` securely — it contains consent records; restrict file permissions.
- Provide a contact method for guardians to request deletion of their child's data.
