import { Router } from 'express';
import { getDb } from '../lib/db.js';

const r = Router();

// GET /api/v1/universes?limit=50&cursor=<ISO or id>&order=last_seen|players
r.get('/', (req, res) => {
  const db = getDb();
  const limit = Math.min(200, Number(req.query.limit ?? 50));
  const order = String(req.query.order ?? 'last_seen');
  const cursor = req.query.cursor ? String(req.query.cursor) : null;

  let where = 'WHERE u.is_tracked=1';
  let orderBy = 'ORDER BY u.last_seen_at DESC, u.universe_id DESC';
  let cursorClause = '';

  if (order === 'players') {
    orderBy = 'ORDER BY lc.playing DESC NULLS LAST, u.universe_id DESC';
  }

  if (cursor) {
    if (order === 'players') {
      cursorClause = 'AND (lc.playing < CAST(? AS INTEGER))';
    } else {
      cursorClause = 'AND (u.last_seen_at < ?)';
    }
  }

  const rows = db.prepare(
    `SELECT u.universe_id AS universeId,
            u.name,
            (SELECT url FROM universe_icons i WHERE i.universe_id = u.universe_id AND i.size='150x150') AS iconUrl,
            lc.playing,
            lc.favorites_total AS favorites,
            (SELECT wilson_score FROM trending_scores_hourly t WHERE t.universe_id=u.universe_id ORDER BY ts DESC LIMIT 1) AS wilson
     FROM universes u
     LEFT JOIN universe_live_cache lc ON lc.universe_id = u.universe_id
     ${where} ${cursorClause} ${orderBy} LIMIT ?`
  ).all(cursor ? [cursor, limit] : [limit]);

  res.json({ items: rows, nextCursor: rows.length ? (order === 'players' ? rows.at(-1).playing : rows.at(-1).last_seen_at) : null });
});

// POST /api/v1/universes/fetch?universeId=123&force=1
r.post('/fetch', (req, res) => {
  try {
    const db = getDb();
    const universeId = Number(req.query.universeId || req.body?.universeId);
    if (!universeId || !Number.isFinite(universeId)) return res.status(400).json({ error: 'universeId required' });
    const force = Boolean(req.query.force || req.body?.force);
    // call non-blocking ensure
    try { require('../services/experiences.js').ensureUniverseAsync(universeId); } catch (e) {}

    // assign a runId token so frontend can poll; use timestamp
    const runId = String(Date.now());
    try {
      db.prepare(`UPDATE universes SET last_fetch_run_id=?, last_fetch_status='queued', last_fetch_started_at=datetime('now') WHERE universe_id = ?`).run(runId, universeId);
    } catch (e) {}

    const header = db.prepare(`SELECT universe_id AS universeId, name, description, created_at, updated_at, is_tracked FROM universes WHERE universe_id = ?`).get(universeId) || null;
    res.json({ ok: true, runId, queued: true, header });
  } catch (e:any) { res.status(500).json({ ok:false, error: String(e?.message || e) }); }
});

// GET /api/v1/universes/fetch/progress?universeId=123
r.get('/fetch/progress', (req, res) => {
  try {
    const db = getDb();
    const universeId = Number(req.query.universeId || req.body?.universeId);
    if (!universeId || !Number.isFinite(universeId)) return res.status(400).json({ error: 'universeId required' });
    const row = db.prepare(`SELECT last_fetch_run_id AS runId, last_fetch_status AS status, last_fetch_started_at AS startedAt, last_fetch_finished_at AS finishedAt FROM universes WHERE universe_id = ?`).get(universeId) || null;
    res.json({ ok: true, progress: row });
  } catch (e:any) { res.status(500).json({ ok:false, error: String(e?.message || e) }); }
});

export default r;
