import { getDb } from '../lib/db.js';
import { nowIso } from '../lib/time.js';
import { getGameDetails } from '../fetchers/roblox.js';
import { log, error } from '../lib/logger.js';

// Process a small batch of queued universe fetches.
export async function runFetchQueue(limit = 5) {
  const db = getDb();
  const rows = db.prepare(`SELECT universe_id, last_fetch_run_id FROM universes WHERE last_fetch_status = 'queued' ORDER BY last_fetch_started_at IS NULL DESC, last_fetch_started_at ASC LIMIT ?`).all(limit) as Array<{ universe_id: number; last_fetch_run_id: string | null }>;
  if (!rows.length) {
    log('fetch-queue: no queued universes');
    return;
  }

  log(`fetch-queue: processing ${rows.length} universes`);

  for (const r of rows) {
    const id = Number(r.universe_id);
    const runId = r.last_fetch_run_id ?? String(Date.now());
    try {
      // mark running
      db.prepare(`UPDATE universes SET last_fetch_status='running', last_fetch_started_at=datetime('now'), last_fetch_run_id=? WHERE universe_id = ?`).run(runId, id);
      log('fetch-queue: running fetch for', id);

      // attempt to fetch details
      let details = null;
      try {
        details = await getGameDetails(id);
      } catch (e) {
        error('fetch-queue: getGameDetails failed for ' + id, e);
      }

      // update row with fetched values (best-effort)
      try {
        if (details) {
          db.prepare(`UPDATE universes SET name = ?, description = ?, server_size = ?, last_fetch_status = 'finished', last_fetch_finished_at = datetime('now') WHERE universe_id = ?`).run(details.name ?? null, details.description ?? null, details.serverSize ?? null, id);
        } else {
          // No public data available from Roblox for this universe. Leave a sensible stub name
          // so the UI displays something useful and mark the fetch as idle so it can be
          // re-queued later if desired.
          const stubName = `Universe ${id}`;
          db.prepare(`UPDATE universes SET name = ?, last_fetch_status = 'idle', last_fetch_finished_at = datetime('now') WHERE universe_id = ?`).run(stubName, id);
        }
      } catch (e) {
        error('fetch-queue: update failed for ' + id, e);
        try { db.prepare(`UPDATE universes SET last_fetch_status = 'failed', last_fetch_finished_at = datetime('now') WHERE universe_id = ?`).run(id); } catch {}
      }

    } catch (e) {
      error('fetch-queue: unexpected error for ' + id, e);
      try { db.prepare(`UPDATE universes SET last_fetch_status = 'failed', last_fetch_finished_at = datetime('now') WHERE universe_id = ?`).run(id); } catch {}
    }
  }
}


