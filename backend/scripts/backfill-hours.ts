import { getDb } from '../src/lib/db.js';
import { getFavorites, getGameDetails, getVotes } from '../src/fetchers/roblox.js';

const universeId = Number(process.argv[2]);
const hours = Number(process.argv[3] || 6);

if (!universeId) {
  console.error('Usage: tsx scripts/backfill-hours.ts <universeId> [hours]');
  process.exit(1);
}

const db = getDb();

for (let i = hours; i >= 1; i--) {
  const ts = new Date(Date.now() - i * 3600_000).toISOString();
  const [details, votes, favs] = await Promise.all([
    getGameDetails(universeId),
    getVotes(universeId),
    getFavorites(universeId),
  ]);

  db.prepare(
    `INSERT OR IGNORE INTO universe_stats_hourly
     (ts, universe_id, playing, visits_total, favorites_total, up_votes, down_votes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(ts, universeId, details.playing, details.visitsTotal, favs.favoritesTotal, votes.up, votes.down);
}

console.log('Backfill complete');
