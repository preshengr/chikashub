# Browser local storage

The frontend keeps a small amount of data in `localStorage` so the dashboard and games work
offline and progress survives reloads. Nothing leaves the device except gameplay events sent
to the API when a session is valid.

## Keys

| Key | Contents |
| --- | -------- |
| `chika.session` | Active session: token, username, expiry, cached child profile |
| `chika.progress` | Per-game progress mirror (schema below) |
| `chika.progress.version` | Schema version of the progress blob (`1`) |

## Session (`chika.session`)

```json
{
  "token": "…",
  "username": "mia55549",
  "expiresAt": "2026-10-02T14:30:00.000Z",
  "child": { "firstName": "Mia", "age": 7, "readingLevel": "early_reader", "learningGoals": ["math"] }
}
```

- `src/core/session.ts` reads/writes/removes it, treats a token expiring within 30 seconds as
  expired, and `requireSession()` redirects to `/login` when missing or stale.
- Logout and account reset clear the key.

## Progress (`chika.progress`)

```json
{
  "version": 1,
  "games": {
    "number-ninja": { "maxLevel": 3, "bestScore": 90, "failures": 1, "completions": 0, "started": true, "lastEventAt": "…" }
  }
}
```

`src/core/storage.ts` API:

- `recordStart(gameId)`, `recordLevelComplete(gameId, level, score)`, `recordFailure(gameId)`,
  `recordCompletion(gameId)` — clamp/sanitize before write (level ≥ 0, capped at the game total).
- `getProgress(gameId)`, `getQuota()` → `{ usageBytes, quotaBytes, percentUsed }`.
- `resetProgress(gameId)`, `resetAllProgress()` — behind the two-step confirmation on the
  login page and the storage modal on the dashboard.
- Corrupt/foreign values are dropped on read (`sanitize`); storage failures (private mode,
  quota exceeded) fall back to in-memory state without breaking the UI.

## Limits & safety

- ~5 MB `localStorage` budget; `formatBytes` renders usage in the storage panel.
- Writes are best-effort with `try/catch` — never a hard dependency.
- The dashboard mirrors server progress when online and falls back to this blob offline
  (using the same filtering rules as the backend).
