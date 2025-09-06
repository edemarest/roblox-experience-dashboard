import { getDb } from '../lib/db.js';
import { discoverTopUniverseIds } from '../fetchers/discovery.js';

export async function runAutoDiscovery(max = 200, debug = false) {
  const db = getDb();
  const before = db.prepare(`SELECT COUNT(*) AS c FROM universes WHERE is_tracked=1`).get() as { c: number };

  const ids = await discoverTopUniverseIds(max, debug);

  const ins = db.prepare(`
    INSERT INTO universes (universe_id, is_tracked, created_at)
    VALUES (?, 1, datetime('now'))
    ON CONFLICT(universe_id) DO UPDATE SET is_tracked=1
  `);

  const tx = db.transaction((xs: number[]) => {
    for (const id of xs) ins.run(id);
  });
  tx(ids);

  const after = db.prepare(`SELECT COUNT(*) AS c FROM universes WHERE is_tracked=1`).get() as { c: number };
  const newlyTracked = Math.max(0, after.c - before.c);

  console.log('[auto-discovery] input ids=', ids.length, 'newlyTracked=', newlyTracked, 'totalTracked=', after.c);
  return { input: ids.length, newlyTracked, total: after.c };
}
