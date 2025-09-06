import { getDb } from '../lib/db.js';
import { nowIso, hoursAgoIso } from '../lib/time.js';
import { getGameDetails, getVotes, getFavorites } from '../fetchers/roblox.js';
import { ema, mean, stdev, wilsonScore } from '../lib/calc.js';
import cliProgress from 'cli-progress';

export async function runHourlySnapshot() {
    console.log('[hourly-snapshot] Starting hourly snapshot...');
    const db = getDb();
    const tracked = db.prepare(`SELECT universe_id FROM universes WHERE is_tracked=1`).all() as { universe_id: number }[];
    const ts = nowIso();
    console.log(`[hourly-snapshot] ${tracked.length} universes to snapshot.`);
    let success = 0, failed = 0;
    const bar = new cliProgress.SingleBar({
      format: '[hourly-snapshot] {bar} {percentage}% | {value}/{total} universes',
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
                `INSERT INTO universes (universe_id, name, description, server_size, last_seen_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(universe_id) DO UPDATE SET
         name=COALESCE(excluded.name, universes.name),
         description=COALESCE(excluded.description, universes.description),
         server_size=COALESCE(excluded.server_size, universes.server_size),
         last_seen_at=datetime('now')`
            ).run(universe_id, details.name, details.description, details.serverSize);

            db.prepare(
                `INSERT OR IGNORE INTO universe_stats_hourly
       (ts, universe_id, playing, visits_total, favorites_total, up_votes, down_votes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(ts, universe_id, details.playing, details.visitsTotal, favs.favoritesTotal, votes.up, votes.down);

            // --- trending calc (compute dz/sustain/wilson) ---
            const windowSince = hoursAgoIso(24 * 14);
            const rows = db.prepare(
                `SELECT ts, playing, up_votes, down_votes
   FROM universe_stats_hourly
   WHERE universe_id = ? AND ts >= ?
   ORDER BY ts`
            ).all(universe_id, windowSince) as Array<{
                ts: string;
                playing: number | null;
                up_votes: number | null;
                down_votes: number | null;
            }>;

            // Build 1h deltas for 'playing'
            const deltas: number[] = [];
            for (let i = 1; i < rows.length; i++) {
                const a = rows[i - 1];
                const b = rows[i];
                if (a.playing != null && b.playing != null) {
                    deltas.push(b.playing - a.playing);
                }
            }
            const delta1h = deltas.length ? deltas[deltas.length - 1] : null;

            // Baseline = up to last 24 deltas (excluding the latest)
            const baseline = deltas.slice(Math.max(0, deltas.length - 1 - 24), Math.max(0, deltas.length - 1));
            const m = mean(baseline);
            let s = stdev(baseline);
            // If baseline exists but variance is zero, use small epsilon so early hours produce a dz
            if (s === 0 && baseline.length >= 3) s = 1e-6;

            const dz = delta1h != null && s > 0 ? (delta1h - m) / s : null;
            const sustain = ema(deltas.slice(-6), 6); // 6h EMA of deltas

            // Wilson score
            const latest = rows[rows.length - 1];
            const wilson = latest && latest.up_votes != null && latest.down_votes != null
                ? wilsonScore(latest.up_votes, latest.down_votes)
                : null;

            db.prepare(
                `INSERT OR REPLACE INTO trending_scores_hourly
       (ts, universe_id, dz_playing_1h, accel, sustain_6h, wilson_score, rank_bucket)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(ts, universe_id, dz, null, sustain, wilson, null);

            success++;
        } catch (err) {
            failed++;
            console.warn(`[hourly-snapshot] Failed universe ${universe_id}:`, String((err as Error).message || err));
        }
        bar.increment();
    }
    bar.stop();
    console.log(`[hourly-snapshot] Snapshot complete. Success: ${success}, Failed: ${failed}`);
}