// src/jobs/daily-metadata.ts
import { getDb } from '../lib/db.js';
import { getGameDetails, getGroup, getUser } from '../fetchers/roblox.js';
import cliProgress from 'cli-progress';

export async function runDailyMetadata() {
  console.log('[daily-metadata] Starting daily metadata update...');
  const db = getDb();
  const tracked = db.prepare(`SELECT universe_id FROM universes WHERE is_tracked=1`).all() as { universe_id:number }[];
  console.log(`[daily-metadata] ${tracked.length} universes to update.`);
  let success = 0, failed = 0;
  const bar = new cliProgress.SingleBar({
    format: '[daily-metadata] {bar} {percentage}% | {value}/{total} universes',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });
  bar.start(tracked.length, 0);
  for (const { universe_id } of tracked) {
    try {
      const d = await getGameDetails(universe_id);

      // upsert creator
      if (d.creatorId && d.creatorType) {
        let creatorName = d.creatorName ?? null;
        if (!creatorName) {
          creatorName = d.creatorType?.toUpperCase() === 'GROUP'
            ? (await getGroup(d.creatorId)).name
            : (await getUser(d.creatorId)).name;
        }
        db.prepare(
          `INSERT INTO creators (creator_id, creator_type, name)
           VALUES (?, ?, ?)
           ON CONFLICT(creator_id) DO UPDATE SET
             creator_type=excluded.creator_type,
             name=COALESCE(excluded.name, creators.name)`
        ).run(d.creatorId, d.creatorType.toUpperCase(), creatorName);

        db.prepare(`UPDATE universes SET creator_id=? WHERE universe_id=?`)
          .run(d.creatorId, universe_id);
      }

      // update universe fields
      db.prepare(
        `UPDATE universes
         SET name=COALESCE(?, name),
             description=COALESCE(?, description),
             server_size=COALESCE(?, server_size),
             updated_at=datetime('now')
         WHERE universe_id=?`
      ).run(d.name, d.description, d.serverSize, universe_id);
      success++;
    } catch (err) {
      failed++;
      console.warn(`[daily-metadata] Failed universe ${universe_id}:`, String((err as Error).message || err));
    }
    bar.increment();
  }
  bar.stop();
  console.log(`[daily-metadata] Update complete. Success: ${success}, Failed: ${failed}`);
}
