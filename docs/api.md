# API reference

Base URL (development): `http://localhost:3001/api` — behind the gateway it is
`http://localhost:3000/api`.

## Envelope

Every response is JSON wrapped in a uniform envelope:

```json
{ "success": true, "data": { } }
```

```json
{ "success": false, "error": { "code": "USER_NOT_FOUND", "message": "User Does Not Exist - Try Again", "details": { "child.age": "Age must be between 4 and 12" } } }
```

- `GET` returns **200**, creates return **201**. `logout` and `deny` return **200** explicitly.
- `error.details` (optional) is an array of `{ "field": "child.age", "message": "…" }` pairs —
  dotted field paths from the DTO tree, one message per field.
- Authentication uses `Authorization: Bearer <token>`.

### Error codes

| Code | HTTP | Meaning |
| ---- | ---- | ------- |
| `VALIDATION_ERROR` | 400 | DTO validation failed (`details` carries field paths) |
| `UNAUTHORIZED` | 401 | Missing/invalid credentials or consent |
| `INVALID_TOKEN` | 401 | Session token not recognised |
| `SESSION_EXPIRED` | 401 | Session past its TTL |
| `USER_NOT_FOUND` | 404 | Login for an unknown username (message is exactly `User Does Not Exist - Try Again`) |
| `NOT_FOUND` | 404 | Route or entity not found (e.g. unknown `gameId`) |
| `REGISTRATION_EXPIRED` | 410/404 | Pending registration window elapsed |
| `CONFLICT` | 409 | Data conflicts with an existing record |
| `USERNAME_TAKEN` | 409/500 | Every username candidate was already allocated |
| `RATE_LIMITED` | 429 | Per-IP rate limit exceeded (`RL_AUTH_MAX`, `RL_EVENT_MAX`) |
| `INVALID_GAME_EVENT` | 400 | Gameplay event failed schema/sanity checks |
| `UNKNOWN_GAME` | 400 | `gameId` is not in the catalogue |
| `DATABASE_ERROR` / `INTERNAL_ERROR` | 500 | Unhandled server fault |
| `SERVICE_UNAVAILABLE` | 503 | Backend unreachable (returned by the gateway) |

## Auth

### `POST /auth/register`

Stages a registration and generates a username. Public.

```json
{
  "parent": { "firstName": "Ada", "lastName": "Lovelace", "relationship": "mother",
              "email": "ada@example.com", "phone": "optional" },
  "child": { "firstName": "Mia", "age": 7, "grade": "grade_1" },
  "preferences": { "learningGoals": ["math", "reading"], "readingLevel": "early_reader",
                   "gameplayStyle": "story" },
  "consent": { "consentData": true, "termsConsent": true,
               "signatureFullName": "Ada Lovelace", "signatureDate": "2026-10-01" }
}
```

Rules: `age` 4–12 (`Age must be between 4 and 12`), 1–2 learning goals, names letters only,
COPPA + terms checkboxes required, signature ≥ 3 chars. Unknown top-level keys are stripped.

**201** → `{ username, expiresAt, expiresInMinutes, childFirstName }` — username format `[a-z]{3}\d{5}`,
confirmation window `PENDING_TTL_MINUTES` (default 30).

### `POST /auth/register/confirm`

`{ "username": "mia55549", "accept": true }`

- **200** `{ username, token, expiresIn, expiresAt, profile }` — activates the account and opens a session.
- **200** `{ username, denied: true }` when `accept` is `false`.
- 404 `USER_NOT_FOUND` for unknown usernames, `REGISTRATION_EXPIRED` past the window.

### `POST /auth/register/deny`

`{ "username": "mia55549" }` → **200** `{ username, removed: true }` (staged record deleted).

### `POST /auth/login`

`{ "username": "mia55549" }` — case-insensitive, trims whitespace.

**200** → `{ username, token, expiresIn, expiresAt, profile }`.
**404** `USER_NOT_FOUND` with message `User Does Not Exist - Try Again` for unknown usernames.
400 for malformed usernames, 401 for pending (unconfirmed) accounts.

### `GET /auth/me`

Requires bearer token. **200** → full profile (parent, child, preferences, consent timestamps).

### `POST /auth/logout`

Requires bearer token. **200** `{ success: true }`; revokes the presented session only.

## Dashboard

### `GET /dashboard`

Requires bearer token. **200** → `DashboardPayload`:

```json
{
  "username": "mia55549",
  "profile": { },
  "child": { "firstName": "Mia", "age": 7, "readingLevel": "early_reader", "...": "" },
  "team": "mid_age",
  "teamLabel": "Mid Age Team",
  "serverTime": "2026-10-01T14:30:00.000Z",
  "games": [ { "id": "number-ninja", "...": "", "progress": { "maxLevel": 3, "bestScore": 90, "failures": 1, "completions": 0, "started": true } } ],
  "sections": [ { "goal": "math", "label": "Math & Numbers", "games": [ ] } ],
  "progress": { "byGame": [ ], "overall": { } },
  "learningGoalLabels": [ { "goal": "math", "label": "Math & Numbers" } ],
  "excluded": [ { "id": "story-stitch", "reason": "reading_level_too_high" } ]
}
```

Filtering/ranking mirrors `frontend/src/core/catalog.ts` (see [database](database.md) and the
catalogue section of the backend `game/catalog.ts`): team assignment by age, reading-level cap,
age-window exclusions (`age_out_of_range_<min>_<max>`), difficulty floor for puzzlers, and
relevance scoring against the selected learning goals / gameplay style.

## Games & gameplay

### `GET /games` (public)

**200** → `{ games: GameDefinition[], count: 13 }`. Each definition carries id, title, genre,
age window, reading level, difficulty, learning goals, instructions and slides.

### `GET /game/detail?gameId=number-ninja` (public)

**200** → single `GameDefinition`, 404 `NOT_FOUND` otherwise.

### `POST /game/event`

Requires bearer token. Rate limited (`RL_EVENT_MAX` per minute).

```json
{ "gameId": "number-ninja", "eventType": "start", "level": 0, "score": 0 }
```

- `eventType`: `start` | `level_complete` | `failure` | `game_complete`
- `level` must be ≥ 0 — use `0` for `start`; `score` ≥ 0, optional `clientTs`, `payload`.

**201/200** → `{ accepted: true }` and updates the `progress` aggregate
(`maxLevel` caps at the game's level total, `failures` never exceed the aggregate).

### `GET /game/progress[?gameId=...]`

Requires bearer token. **200** → `{ byGame: GameProgressRow[], overall: {...} }`
(with `gameId`, `byGame` contains at most that game).

## Rate limiting

Per-IP sliding window (`RL_WINDOW_MS`, default 60000 ms):

- Auth routes: `RL_AUTH_MAX` (default 20/min)
- Gameplay events: `RL_EVENT_MAX` (default 300/min)

Exceeding returns 429 `RATE_LIMITED`.

## Health / probe

`GET /api/games` is the liveness probe used by `scripts/smoke.ps1` (public, cheap).
