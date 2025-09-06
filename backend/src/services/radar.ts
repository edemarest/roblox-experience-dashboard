import { getDb } from '../lib/db.js';

export function getBreakouts(limit = 50, minVotes = 0) {
const db = getDb();
const rows = db.prepare(
`SELECT t.universe_id as universeId, u.name, t.dz_playing_1h as dz, t.accel, t.sustain_6h as sustain, t.wilson_score as wilson
FROM trending_scores_hourly t
JOIN universes u ON u.universe_id=t.universe_id
JOIN (
SELECT universe_id, MAX(ts) AS ts FROM trending_scores_hourly GROUP BY universe_id
) latest ON latest.universe_id=t.universe_id AND latest.ts=t.ts
ORDER BY t.dz_playing_1h DESC NULLS LAST
LIMIT ?`
).all(limit);
return rows;
}