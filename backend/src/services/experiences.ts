import { getDb } from '../lib/db.js';
import { wilsonScore } from '../lib/calc.js';
import { nowIso, hoursAgoIso } from '../lib/time.js';
import { getGameDetails } from '../fetchers/roblox.js';

export function searchExperiences(q: string, limit = 20) {
    const db = getDb();
    if (!q || !q.trim()) return [] as any[];
    const stmt = db.prepare(
        `SELECT u.universe_id as universeId, u.name, u.creator_id as creatorId
FROM universes_fts f
JOIN universes u ON u.universe_id = f.rowid
WHERE universes_fts MATCH ?
LIMIT ?`
    );
    const rows = stmt.all(q, limit) as Array<{
        universeId: number;
        name: string | null;
        creatorId: number | null;
    }>;
    return rows.map((r) => ({
        universeId: r.universeId,
        name: r.name,
        creator: { id: r.creatorId, type: null, name: null }
    }));
}

export function getExperienceHeader(universeId: number) {
  const db = getDb();
  // CAST to be defensive about bindings
  const row = db.prepare(
  `SELECT u.universe_id, u.name, u.creator_id, u.server_size, u.description, u.created_at, u.updated_at, u.is_tracked,
      c.creator_type, c.name as creator_name
   FROM universes u
   LEFT JOIN creators c ON c.creator_id = u.creator_id
   WHERE u.universe_id = CAST(? AS INTEGER)`
  ).get(universeId);

  if (!row) return null;

  return {
    universeId: row.universe_id as number,
  name: (row as any).name as string | null,
  description: (row as any).description ?? null,
  creator: { id: (row as any).creator_id ?? null, type: (row as any).creator_type ?? null, name: (row as any).creator_name ?? null },
  serverSize: (row as any).server_size ?? null,
  createdAt: (row as any).created_at ?? null,
  updatedAt: (row as any).updated_at ?? null,
  isTracked: (row as any).is_tracked ? true : false
  };
}

// NEW: If header is missing, create a minimal row on the fly (from stub fetcher)
export async function ensureUniverse(universeId: number) {
  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM universes WHERE universe_id = CAST(? AS INTEGER)`).get(universeId);
  if (!exists) {
    const dflt = { name: `Universe ${universeId}`, description: null, serverSize: null };
    // try to fetch nicer stubbed details
    try {
      const details = await getGameDetails(universeId);
      db.prepare(
        `INSERT INTO universes (universe_id, name, description, server_size, is_tracked, created_at)
         VALUES (?, ?, ?, ?, 1, datetime('now'))`
      ).run(universeId, details.name ?? dflt.name, details.description ?? null, details.serverSize ?? null);
    } catch {
      db.prepare(
        `INSERT INTO universes (universe_id, name, is_tracked, created_at)
         VALUES (?, ?, 1, datetime('now'))`
      ).run(universeId, dflt.name);
    }
  }
}

// Non-blocking ensure: insert stub row quickly (if missing) and mark as queued for background fetch
export function ensureUniverseAsync(universeId: number) {
  const db = getDb();
  const exists = db.prepare(`SELECT 1 FROM universes WHERE universe_id = CAST(? AS INTEGER)`).get(universeId);
  if (!exists) {
    const dfltName = `Universe ${universeId}`;
    db.prepare(
      `INSERT INTO universes (universe_id, name, is_tracked, created_at, last_fetch_status)
       VALUES (?, ?, 0, datetime('now'), 'queued')`
    ).run(universeId, dfltName);
  } else {
    // mark queued if not already running/completed
    try {
      const cur = db.prepare(`SELECT last_fetch_status FROM universes WHERE universe_id = ?`).get(universeId) as any;
      if (!cur || !cur.last_fetch_status || cur.last_fetch_status === 'idle') {
        db.prepare(`UPDATE universes SET last_fetch_status='queued', last_fetch_started_at=NULL, last_fetch_finished_at=NULL WHERE universe_id = ?`).run(universeId);
      }
    } catch (e) {
      // ignore
    }
  }
}

export function getLatestHourly(universeId: number) {
    const db = getDb();
    return db.prepare(
        `SELECT ts, playing, visits_total AS visitsTotal, favorites_total AS favoritesTotal, up_votes AS up, down_votes AS down
FROM universe_stats_hourly WHERE universe_id=? ORDER BY ts DESC LIMIT 1`
    ).get(universeId) as
        | { ts: string; playing: number | null; visitsTotal: number | null; favoritesTotal: number | null; up: number | null; down: number | null }
        | undefined;
}

export function getSparkline(universeId: number, hours: number) {
    const db = getDb();
    const since = hoursAgoIso(hours);
    const rows = db.prepare(
        `SELECT ts, playing, favorites_total AS favorites
FROM universe_stats_hourly
WHERE universe_id=? AND ts>=? ORDER BY ts`
    ).all(universeId, since) as Array<{
        ts: string;
        playing: number | null;
        favorites: number | null;
    }>;
    return {
        playing: rows.map((r) => [r.ts, r.playing] as [string, number | null]),
        favorites: rows.map((r) => [r.ts, r.favorites] as [string, number | null])
    };
}

export function buildExperienceView(universeId: number) {
  const header = getExperienceHeader(universeId);
  if (!header) return null;

  const latest = getLatestHourly(universeId);

  const likeRatio =
    latest && latest.up != null && latest.down != null && latest.up + latest.down > 0
      ? latest.up / (latest.up + latest.down)
      : null;

  const wilson =
    latest && latest.up != null && latest.down != null
      ? wilsonScore(latest.up, latest.down)
      : null;

const s24 = getSparklineHourlyAligned(universeId, 24);
const s7d = getSparklineHourlyAligned(universeId, 24 * 7);

  const estimatedServers =
    header.serverSize && latest?.playing != null
      ? Math.ceil(latest.playing / header.serverSize)
      : null;

  return {
    universeId,
    header,
    snapshot: latest
      ? {
          asOf: latest.ts,
          playing: latest.playing ?? null,
          visitsTotal: latest.visitsTotal ?? null,
          favoritesTotal: latest.favoritesTotal ?? null,
          votes: { up: latest.up ?? null, down: latest.down ?? null },
          likeRatio,
          wilsonScore: wilson
        }
      : {
          asOf: new Date().toISOString(),
          playing: null,
          visitsTotal: null,
          favoritesTotal: null,
          votes: { up: null, down: null },
          likeRatio: null,
          wilsonScore: null
        },
    sparklines: {
      playing24h: s24.playing,
      playing7d: s7d.playing,
      favorites24h: s24.favorites
    },
    events: [],
    derived: { estimatedServers, iconImpact6h: null }
  };
}

export function getHistory(
  universeId: number,
  metric: 'playing' | 'favorites' | 'visits' | 'up_votes' | 'down_votes',
  hours: number
) {
  const db = getDb();
  const since = hoursAgoIso(hours);
  const colMap: Record<string, string> = {
    playing: 'playing',
    favorites: 'favorites_total',
    visits: 'visits_total',
    up_votes: 'up_votes',
    down_votes: 'down_votes'
  };
  const col = colMap[metric] || 'playing';
  const rows = db.prepare(
    `SELECT ts, ${col} as v FROM universe_stats_hourly WHERE universe_id=? AND ts>=? ORDER BY ts`
  ).all(universeId, since) as Array<{ ts: string; v: number | null }>;

  return rows.map((r) => [r.ts, r.v] as [string, number | null]);
}

export function getSparklineHourlyAligned(universeId: number, hours: number) {
  const db = getDb();
  const since = hoursAgoIso(hours);
  const rows = db.prepare(
    `WITH buckets AS (
       SELECT substr(ts, 1, 13) AS hour_key, MAX(ts) AS ts
       FROM universe_stats_hourly
       WHERE universe_id = ? AND ts >= ?
       GROUP BY hour_key
     )
     SELECT s.ts, s.playing, s.favorites_total AS favorites
     FROM buckets b
     JOIN universe_stats_hourly s ON s.ts = b.ts AND s.universe_id = ?
     ORDER BY s.ts`
  ).all(universeId, since, universeId) as Array<{ ts: string; playing: number|null; favorites: number|null }>;

  return {
    playing: rows.map(r => [r.ts, r.playing] as [string, number|null]),
    favorites: rows.map(r => [r.ts, r.favorites] as [string, number|null]),
  };
}