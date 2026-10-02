# Data storage

The backend talks to storage through a small `DataStore` interface
(`backend/src/database/data-store.ts`) injected as the `DATA_STORE` token:

| Implementation | Used when | Backing store |
| -------------- | --------- | ------------- |
| `FirestoreStore` | `DATA_STORE=firestore` (required when `NODE_ENV=production`) | Cloud Firestore via `firebase-admin` |
| `MemoryStore` | `DATA_STORE=memory` (default) — local dev and every test run | in-process map |

`MemoryStore` mirrors Firestore semantics: `create()` fails when the document exists,
`delete()` on a missing document is a no-op, queries only match direct children of a
collection path, and transaction reads observe writes made earlier in the same
transaction. `backend/src/database/firestore.store.spec.ts` runs the same behaviour
suite against both stores (the Firestore half runs only when `FIRESTORE_EMULATOR_HOST`
and `GCLOUD_PROJECT` are set, e.g. via `firebase emulators:start --only firestore`).

Timestamps are ISO-8601 UTC strings everywhere.

## Collections

Document paths use `{collection}/{documentId}`; subcollections are addressed by full path.

### `parents/{email}`
Guardian contact details, keyed by the lowercased email (one document per household).

| Field | Type | Notes |
| ----- | ---- | ----- |
| `firstName`, `lastName` | string | letters-only validation at API layer |
| `relationship` | string | `mother` \| `father` \| `legal_guardian` \| `other` |
| `email` | string | lowercased; the document id |
| `phone` | string \| null | optional |
| `createdAt`, `updatedAt` | string | ISO-8601 UTC |

Re-registering with the same email merges into this document.

### `children/{autoId}`
Child profile, gameplay preferences and the COPPA consent record.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `parentId` | string | = `parents` document id (the email) |
| `firstName` | string | |
| `age` | number | 4–12, enforced by DTO validation |
| `grade` | string | `pre_k` … `grade_5` |
| `readingLevel` | string | `pre_reader` \| `early_reader` \| `independent_reader` |
| `learningGoals` | string[] | 1–2 entries (`math`, `reading`, …) |
| `gameplayStyle` | string | `story` \| `action` \| `relaxed` |
| `signatureName`, `signatureDate` | string | guardian e-signature |
| `coppaConsent`, `termsConsent` | boolean | both required |
| `consentedAt` | string \| null | set when the guardian accepts |
| `createdAt`, `updatedAt` | string | |

### `usernames/{username}`
Generated username lifecycle (`[a-z]{3}\d{5}`, e.g. `mia55549`), keyed by the username.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `childId` | string | `children` document id; one username per child |
| `status` | string | `pending` → `active` on confirm |
| `prefix` | string | first three letters, used for prefix bookkeeping |
| `createdAt`, `activatedAt` | string \| null | |

### `usernamePrefixes/{prefix}`
Counter document (`{prefix, count, updatedAt}`) supporting similar-name detection:
`prefixExists()` is a document get instead of a `LIKE` query, which keeps username
generation usable **inside transactions** (Firestore forbids queries in a transaction).
Maintained by `UsernameService.recordPrefix()` when a username is created and
`releasePrefix()` when a staged registration is removed.

### `pending/{username}`
Staged registrations awaiting guardian Accept/Deny.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `expiresAt` | string | `PENDING_TTL_MINUTES` (default 30) after creation |
| `createdAt` | string | |

Expired entries are purged lazily (`purgeExpiredPending`, runs on register/confirm).

### `sessions/{tokenHash}`
Bearer tokens — only the SHA-256 hash of the issued token is the document id.

| Field | Type | Notes |
| ----- | ---- | ----- |
| `username`, `childId` | string | denormalised for single-read validation |
| `createdAt`, `expiresAt`, `lastSeenAt` | string | TTL `SESSION_TTL_HOURS` (default 24) |

`POST /auth/logout` deletes only the presented token's document. Expired sessions are
purged opportunistically (at most once per hour per process) plus immediately when an
expired token is presented.

### `events/{autoId}`
Append-only telemetry: `{username, gameId, eventType, level, score, payload,
clientTimestamp, createdAt}`. `gameId` is validated against the catalogue; `payload`
is an optional JSON string, truncated at 2000 characters.

### `usernames/{username}/progress/{gameId}`
Per-game aggregate folded from events (single source for the dashboard):
`{maxLevel, bestScore, failures, completions, started, lastEventAt, updatedAt}`.
Updated read-modify-write inside the same transaction that appends the event.

## Transaction & consistency rules

- Firestore transactions expose **document reads/writes only** — the `StoreScope`
  interface has no `query()`, so "no queries inside a transaction" is compile-time.
- Uniqueness checks use `create()` (precondition) inside the transaction: usernames,
  pending entries and parent creation all fail with `DataExistsError`, mapped to the
  `CONFLICT` API error.
- There is no cascade delete in Firestore: removing a staged registration deletes
  `usernames/{u}`, `pending/{u}` and `children/{childId}` explicitly in one
  transaction. Active accounts are never deleted (`deny` refuses them), and a pending
  account cannot own sessions/events/progress because those require an active session.

## Environment

| Variable | Values | Notes |
| -------- | ------ | ----- |
| `DATA_STORE` | `memory` \| `firestore` | defaults to `memory`; boot fails if `NODE_ENV=production` without `firestore` |
| `PENDING_TTL_MINUTES` | number | staged registration window (default 30) |
| `SESSION_TTL_HOURS` | number | session lifetime (default 24) |

## Derivations

- **Team** (age): `resolveTeam` — ≤6 → `pre_readers`, ≤9 → `mid_age`, else `puzzlers`.
- **Filtering**: reading-level cap (`teamReadingCap`), age window (`age_out_of_range_<min>_<max>`),
  puzzlers difficulty floor (`too_easy_for_team`), reading level (`reading_level_too_high`).
- **Ranking**: bonuses for primary/other learning goals, gameplay style, reading match, age fit,
  difficulty fit.
- **Sections**: `groupGamesByGoal` — selected goals first (primary first), every game exactly
  once, leftovers under `More Games`.

These pure functions live in `backend/src/game/catalog.ts` and are mirrored in
`frontend/src/core/catalog.ts` (covered by both test suites).
