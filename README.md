# Roblox Stats Backend — README

> **Purpose:** This backend ingests public Roblox game (experience) metrics, stores them in SQLite, computes simple trending signals, and exposes a small HTTP API for a React frontend (Experience Viewer + Radar).  
> **Stack:** Node (ESM) + TypeScript, Express, better‑sqlite3, SQLite (FTS5), tsx runner, node-cron.

---

## Quick Start

```bash
# 0) Requirements
# - Node 18+ (Node 22 works too)
# - SQLite3 available on PATH (for sqlite3 CLI checks)

# 1) Install deps
npm i

# 2) Run DB migrations (create tables + FTS + seed demo rows)
npm run migrate

# 3) Start the HTTP server
npm run dev
# -> [app] API listening on http://localhost:3000
# Health check:
curl -s http://localhost:3000/health

# 4) (Recommended) Start the job scheduler in a 2nd terminal
npm run jobs

# 5) Track a real universe and kick one ingestion pass
curl -s -X POST http://localhost:3000/api/v1/tracking/experiences \
  -H 'Content-Type: application/json' \
  -d '{"universeId": 7008097940, "name":"Ink Game"}'

npm run seed

# 6) Try the endpoints
curl -s http://localhost:3000/api/v1/experiences/7008097940 | jq
curl -s 'http://localhost:3000/api/v1/radar/breakouts?limit=5' | jq
```

---

## Project Layout & How Things Link Together

### High-level flow

```
          +------------------------+
          |  Jobs (cron / manual)  |
          |  - live-cache (10m)    |
          |  - hourly-snapshot     |
          |  - daily-metadata      |
          +-----------+------------+
                      |
        Roblox Public APIs (server-side fetch)
                      |
                 +----v----+
                 | SQLite  |  <= better-sqlite3 (sync) + FTS5
                 +----+----+
                      |
               +------v-------+
               | Express API  |
               | /experiences |
               | /radar       |
               | /tracking    |
               +------+-------+
                      |
                React Frontend
```

- **Jobs** fetch data from **Roblox public Games APIs**, write to **SQLite**.
- **Express routes** read from SQLite, aggregate DTOs, and serve JSON to the frontend.
- **TypeScript ESM** (NodeNext) is used everywhere; **relative imports must end in `.js`** in source code.

---

## Directory Structure (Backend)

| Path | Purpose | Key exports / Notes |
|---|---|---|
| `src/server.ts` | App entry; wires middleware and routes; starts HTTP server. | `app.listen(PORT)` |
| `src/routes/experiences.ts` | Experience Viewer endpoints. | `GET /api/v1/experiences/:id`, `GET /:id/history`, `GET /compare` |
| `src/routes/radar.ts` | Trending Radar endpoints. | `GET /api/v1/radar/breakouts` |
| `src/routes/tracking.ts` | Track/untrack universes to ingest. | `POST /api/v1/tracking/experiences`, `DELETE /tracking/experiences/:id` |
| `src/services/experiences.ts` | DB reads → DTO assembly for Experience Viewer; history/sparklines. | `buildExperienceView`, `getHistory`, `searchExperiences` |
| `src/fetchers/roblox.ts` | Server-side calls to Roblox APIs. | `getGameDetails`, `getVotes`, `getFavorites`, `resolveUniverseIdFromPlace` |
| `src/jobs/scheduler.ts` | Cron entry; schedules live-cache, hourly-snapshot, daily-metadata. | `cron.schedule(...)` |
| `src/jobs/live-cache.ts` | 10-minute cache of live metrics. | `runLiveCache()` |
| `src/jobs/hourly-snapshot.ts` | Hourly rollups; trending scores (dz/sustain/wilson). | `runHourlySnapshot()` |
| `src/jobs/daily-metadata.ts` | Rehydrate names/descriptions/creator info from Roblox. | `runDailyMetadata()` |
| `src/jobs/run-once.ts` | One-shot runner to seed: live-cache → hourly-snapshot → daily-metadata. | `npm run seed` |
| `src/lib/db.ts` | Initialize SQLite connection; `pragma` setup. | `getDb()` |
| `src/lib/time.ts` | Helpers for ISO timestamps & windows. | `nowIso`, `hoursAgoIso` |
| `src/lib/calc.ts` | Math helpers for EMA/mean/stdev/Wilson score. | `ema`, `mean`, `stdev`, `wilsonScore` |
| `src/lib/logger.ts` | Minimal logger wrappers. | `log`, `error` |
| `db/001_init.sql` | Schema (tables, FTS index, triggers if any). | Creates full DB |
| `db/002_seed_dev.sql` | Optional dev seed rows (demo universes). | Can be removed in prod |
| `db/migrate.ts` | Applies SQL migrations in order. | `npm run migrate` |
| `types/shims.d.ts` | Ambient module shims for untyped libs. | `declare module 'better-sqlite3'` |
| `tsconfig.json` | ESM/NodeNext TypeScript configuration. | Enforces `.js` import suffix |
| `scripts/backfill-hours.ts` | Dev helper: write older hourly rows. | `npx tsx scripts/backfill-hours.ts <universeId> <hours>` |
| `scripts/resolve-universe.ts` | Dev helper: placeId → universeId resolve. | Optional |

> **Important:** With `moduleResolution: "NodeNext"`, **all relative imports use `.js` in source** (even though files are `.ts`). Example: `import { X } from '../lib/db.js'`

---

## API Endpoints

### Health
| Method | Route | Description | Example |
|---|---|---|---|
| GET | `/health` | Liveness probe. | `curl -s http://localhost:3000/health` |

### Experiences (Viewer)
| Method | Route | Query | Description |
|---|---|---|---|
| GET | `/api/v1/experiences/:universeId` | — | Returns header, latest snapshot, sparklines, derived metrics. |
| GET | `/api/v1/experiences/:universeId/history` | `metric=playing|favorites|visits|up_votes|down_votes`, `window=24h|7d|…` | Time series for charts. |
| GET | `/api/v1/experiences/compare` | `ids=comma,separated,universeIds` | Returns views for up to ~4 universes. |
| GET | `/api/v1/experiences/search` | `q`, `limit` | Full‑text search on universe names (FTS5). |

### Radar (Trending)
| Method | Route | Query | Description |
|---|---|---|---|
| GET | `/api/v1/radar/breakouts` | `limit` | Top trending by dz/sustain/wilson from the last hourly pass. |

### Tracking (Ingestion Targets)
| Method | Route | Body/Param | Description |
|---|---|---|---|
| POST | `/api/v1/tracking/experiences` | `{"universeId": number, "name"?: string}` | Mark a universe to ingest. |
| DELETE | `/api/v1/tracking/experiences/:universeId` | — | Stop ingesting a universe. |

---

## Database Schema

> SQLite file path defaults to `./data/app.db` (overridable via `DB_PATH`).

### Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `universes` | Registry of tracked universes + metadata. | `universe_id (PK)`, `name`, `description`, `creator_id (FK)`, `server_size`, `is_tracked (0/1)`, `last_seen_at`, `created_at`, `updated_at` |
| `creators` | Creator entities (User/Group) for display. | `creator_id (PK)`, `creator_type ('USER'/'GROUP')`, `name` |
| `universes_fts` | Full‑text index for names (FTS5). | `rowid → universes.universe_id`, `name` |
| `universe_live_cache` | Recent live snapshot (10 min cadence). | `universe_id`, `fetched_at`, `playing`, `favorites_total`, `up_votes`, `down_votes` |
| `universe_stats_hourly` | Historical rollups (hourly). | `ts (ISO)`, `universe_id`, `playing`, `visits_total`, `favorites_total`, `up_votes`, `down_votes` |
| `trending_scores_hourly` | Computed scores by hour. | `ts`, `universe_id`, `dz_playing_1h`, `accel`, `sustain_6h`, `wilson_score`, `rank_bucket` |
| `events` (optional) | Manual/auto annotations for charts. | `ts`, `universe_id`, `type`, `meta` |

### Relationships

- `universes.creator_id → creators.creator_id` (nullable)
- `universes_fts.rowid` mirrors `universes.universe_id` for name search
- Trending rows are keyed by `(ts, universe_id)` and computed from `universe_stats_hourly`

---

## Data Ingestion: Exactly What Happens

1. **Tracking:** You `POST /tracking/experiences` a `universeId`. A row is upserted in `universes` and marked `is_tracked=1`.
2. **live-cache (every 10m):** For each tracked universe, call Roblox APIs (`getGameDetails`, `getVotes`, `getFavorites`) and upsert `universe_live_cache` (fast metrics for UI).
3. **hourly-snapshot (hourly):**
   - Fetch same APIs.
   - Upsert `universes` metadata (name/description/server_size/last_seen_at) **without REPLACE** (preserve fields).
   - Insert a row into `universe_stats_hourly (ts, metrics)` (ignore if duplicate ts).
   - Compute **deltas** of `playing`, baseline mean/stdev (last N=24 deltas excluding latest), **dz**, **sustain (EMA 6h)**, **wilson score**, and upsert `trending_scores_hourly`.
4. **daily-metadata (daily):** Refresh name/description/creator (and creator display name via Users/Groups API) and stitch `creators` ← `universes`.

**Frontend reads:**  
- Experience page uses `universes` + latest `universe_stats_hourly` + sparklines (aligned buckets).  
- Radar page uses `trending_scores_hourly` joined to `universes` for names.

---

## Roblox Fetchers (Public Endpoints)

All called **server-side** (no browser CORS worries):

| Helper | Endpoint | Notes |
|---|---|---|
| `getGameDetails(universeId)` | `GET https://games.roblox.com/v1/games?universeIds=${id}` | Returns name, description, playing, visits, maxPlayers; includes creator fields when present. |
| `getVotes(universeId)` | `GET https://games.roblox.com/v1/games/votes?universeIds=${id}` | Returns upVotes/downVotes. |
| `getFavorites(universeId)` | `GET https://games.roblox.com/v1/games/${id}/favorites/count` | Returns favoritesCount; returns 404 for invalid/non‑universe IDs—code tolerates with `null`. |
| `resolveUniverseIdFromPlace(placeId)` | `GET https://games.roblox.com/v1/games/multiget-place-details?placeIds=${placeId}` (fallback: `apis.roblox.com/universes/...`) | Map placeId → universeId. |

> **Common pitfall:** Passing a **placeId** to endpoints that require **universeId** → 404. The tracker accepts universeId; resolve placeId first if needed.

---

## TypeScript & ESM (NodeNext) Notes

- `tsconfig.json` sets `"module": "NodeNext", "moduleResolution": "NodeNext"`.
- **Rule:** every **relative** import must include `.js` suffix in source:
  - ✅ `import { getDb } from '../lib/db.js'`
  - ❌ `import { getDb } from '../lib/db'`
- Avoid stray compiled `.js` files in `src/` (they shadow `.ts` during resolution). Clean with:
  ```bash
  find src -name "*.js" -o -name "*.js.map" -delete
  ```
- Typings: we infer `better-sqlite3` instance type with `InstanceType<typeof Database>`.
- If the editor complains, `types/shims.d.ts` keeps the dev UX smooth.

---

## Environment Variables

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP server port. |
| `DB_PATH` | `./data/app.db` | SQLite file. |
| `ROBLOX_GAMES_API` | `https://games.roblox.com` | Override Roblox API base (proxy, if needed). |
| `REQUEST_TIMEOUT_MS` | `12000` | Fetcher timeout per request. |

Optional job tuning (if added in your build):
| Var | Default | Meaning |
|---|---|---|
| `SNAPSHOT_CONCURRENCY` | `4` | Parallel fetch cap for hourly job. |
| `LIVE_CACHE_CONCURRENCY` | `4` | Parallel fetch cap for live-cache. |

---

## NPM Scripts

| Script | Does |
|---|---|
| `migrate` | Run SQL migrations in `db/` folder (applies in order). |
| `dev` | Start the HTTP server (`src/server.ts`). |
| `jobs` | Start the cron scheduler (`src/jobs/scheduler.ts`). |
| `seed` | One-shot: `runLiveCache()` → `runHourlySnapshot()` → `runDailyMetadata()` to quickly populate. |

---

## Endpoint DTOs (Shapes)

### `GET /api/v1/experiences/:id`

```jsonc
{
  "universeId": 7008097940,
  "header": {
    "universeId": 7008097940,
    "name": "Ink Game",
    "creator": { "id": 12398672, "type": "GROUP", "name": "games i think" },
    "serverSize": 100
  },
  "snapshot": {
    "asOf": "ISO",
    "playing": 256202,
    "visitsTotal": 2015664484,
    "favoritesTotal": 15593230,
    "votes": { "up": 868726, "down": 212844 },
    "likeRatio": 0.8032,
    "wilsonScore": 0.8024
  },
  "sparklines": {
    "playing24h": [["ISO", 260754], ...],
    "playing7d":  [["ISO", 260754], ...],
    "favorites24h":[["ISO", 15593230], ...]
  },
  "events": [],
  "derived": { "estimatedServers": 2563, "iconImpact6h": null }
}
```

### `GET /api/v1/radar/breakouts?limit=10`

```jsonc
{
  "items": [
    { "universeId": 7008097940, "name": "Ink Game", "dz": 1.8, "accel": null, "sustain": -45.2, "wilson": 0.8024 }
  ]
}
```

### `GET /api/v1/experiences/:id/history?metric=playing&window=7d`

```jsonc
{ "series": [["ISO", 256202], ["ISO", 260754], ...] }
```

---

## Job Details

| Job | Schedule | Writes | Reads | Purpose |
|---|---|---|---|---|
| live-cache | every 10 min | `universe_live_cache` | Roblox APIs | Fast snapshot for UI/status. |
| hourly-snapshot | hourly at `:00` | `universes`, `universe_stats_hourly`, `trending_scores_hourly` | Roblox APIs + DB history | Historical storage + dz/sustain/wilson. |
| daily-metadata | daily | `universes`, `creators` | Roblox APIs (Games, Users, Groups) | Enrich names/descriptions/creator info. |

Trending formulae:
- **dz**: z‑score of latest 1h delta vs mean/stdev of recent (≤24) deltas (excl. latest). If `stdev==0` and baseline length ≥ 3, use tiny epsilon to avoid `null` during early hours.  
- **sustain**: `ema(deltas, 6)` (approx 6h).  
- **wilson**: Wilson score interval center from up/down votes.

---

## Development & Testing

### Common curl tests

```bash
curl -s http://localhost:3000/health
curl -s http://localhost:3000/api/v1/experiences/7008097940 | jq
curl -s 'http://localhost:3000/api/v1/experiences/7008097940/history?metric=playing&window=24h' | jq
curl -s 'http://localhost:3000/api/v1/radar/breakouts?limit=5' | jq
```

### Backfill for charts (dev)

```bash
npx tsx scripts/backfill-hours.ts 7008097940 12
npm run seed
```

### Untrack demo/invalid universes (cleanup)

```bash
curl -s -X DELETE http://localhost:3000/api/v1/tracking/experiences/12812920653
curl -s -X DELETE http://localhost:3000/api/v1/tracking/experiences/15506160459
curl -s -X DELETE http://localhost:3000/api/v1/tracking/experiences/99567941238278
```

---

## Troubleshooting (Real Issues You Might Hit)

| Symptom | Likely Cause | Fix |
|---|---|---|
| Browser shows `net::ERR_CONNECTION_REFUSED` | HTTP server not listening on `:3000` (only jobs started). | In project root: `npm run dev` (look for “API listening…”). Health: `curl http://127.0.0.1:3000/health`. |
| `curl http://localhost:3000/health` prints nothing | Server didn’t start or bound to a different host. | In `src/server.ts` bind to `'127.0.0.1'`; add boot logs; check `lsof -iTCP:3000 -sTCP:LISTEN`. |
| `The requested module '../x.js' does not provide an export …` | ESM resolution + stale `.js` shadowing `.ts`. | Delete `src/**/*.js*` artifacts; ensure relative imports have `.js` suffix; restart. |
| `Cannot use namespace 'BetterSqlite3Database' as a type.` | Type import mismatch. | Use: `import Database from 'better-sqlite3'; let _db: InstanceType<typeof Database> | null = null;` |
| `An expression of type 'void' cannot be tested for truthiness` | Function returned `void` (empty impl) but code checked `if (!view)`. | Implement and return value; or explicit `return` after `res.status(404).json(...)`. |
| Roblox `favorites/count` returns 404 | You passed a **placeId** instead of **universeId**. | Resolve placeId → universeId first; or catch 404 in `getFavorites` and return `{favoritesTotal: null}`. |
| Empty Radar `dz` | Not enough baseline deltas; stdev=0. | Backfill a few hours or use epsilon fallback after ≥3 points. |

---

## Frontend Integration

- Use `.env` in the React app: `VITE_API_BASE=http://localhost:3000` **or** configure a Vite proxy to `/api`.  
- Minimal SDK example (fetchers) lives in your frontend repo: `src/sdk.ts` with `fetchExperience`, `fetchBreakouts`, `fetchHistory`.
- DTOs are stable and documented above.

---

## Notes on Productionizing (when you’re ready)

- Add retry/backoff & concurrency caps around fetchers.
- Enforce simple request budgets to Roblox APIs.
- Move secrets/env to `.env` and never commit it.
- Consider WAL checkpointing and VACUUM schedules for SQLite if the DB grows.

---

## File Map (One-Liner Index)

| File | Links to |
|---|---|
| `src/server.ts` | `src/routes/*`, `src/lib/db.ts` |
| `src/routes/experiences.ts` | `src/services/experiences.ts` |
| `src/routes/radar.ts` | `trending_scores_hourly`, `universes` |
| `src/routes/tracking.ts` | `universes` |
| `src/services/experiences.ts` | `src/lib/db.ts`, `src/lib/calc.ts`, `src/lib/time.ts` |
| `src/jobs/scheduler.ts` | `src/jobs/*` |
| `src/jobs/hourly-snapshot.ts` | `src/fetchers/roblox.ts`, `universe_stats_hourly`, `trending_scores_hourly`, `universes` |
| `src/jobs/live-cache.ts` | `src/fetchers/roblox.ts`, `universe_live_cache` |
| `src/jobs/daily-metadata.ts` | `src/fetchers/roblox.ts`, `creators`, `universes` |
| `src/fetchers/roblox.ts` | Roblox public APIs |
| `db/001_init.sql` | Creates every table + FTS5 |
| `db/002_seed_dev.sql` | Optional dev universes |
| `db/migrate.ts` | Runs `*.sql` in `db/` |

---