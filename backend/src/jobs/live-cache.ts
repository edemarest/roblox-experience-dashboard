import { getDb } from '../lib/db.js';
import { nowIso } from '../lib/time.js';
import { getFavorites, getGameDetails, getVotes } from '../fetchers/roblox.js';
import cliProgress from 'cli-progress';

export async function runLiveCache() {
    console.log('[live-cache] Starting live cache update...');
    const db = getDb();
    const tracked = db.prepare(`SELECT universe_id FROM universes WHERE is_tracked=1`).all() as { universe_id: number }[];
    console.log(`[live-cache] ${tracked.length} universes to update.`);
    let success = 0, failed = 0;
    const bar = new cliProgress.SingleBar({
      format: '[live-cache] {bar} {percentage}% | {value}/{total} universes',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    bar.start(tracked.length, 0);
    for (const { universe_id } of tracked) {
        try {
            const [details, votes, favs] = await Promise.all([
                getGameDetails(universe_id),
                getVotes(universe_id),
                getFavorites(universe_id)
            ]);

            db.prepare(
                `INSERT INTO universe_live_cache (universe_id, fetched_at, playing, favorites_total, up_votes, down_votes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(universe_id) DO UPDATE SET
         fetched_at=excluded.fetched_at,
         playing=excluded.playing,
         favorites_total=excluded.favorites_total,
         up_votes=excluded.up_votes,
         down_votes=excluded.down_votes`
            ).run(universe_id, nowIso(), details.playing, favs.favoritesTotal, votes.up, votes.down);
            success++;
        } catch (err) {
            failed++;
            console.warn(`[live-cache] Failed universe ${universe_id}:`, String((err as Error).message || err));
        }
        bar.increment();
    }
    bar.stop();
    console.log(`[live-cache] Update complete. Success: ${success}, Failed: ${failed}`);
}