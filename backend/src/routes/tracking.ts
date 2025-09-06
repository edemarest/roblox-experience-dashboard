import { Router } from 'express';
import { getDb } from '../lib/db.js';
import { getGameDetails, resolveUniverseIdFromPlace } from '../fetchers/roblox.js';


const r = Router();

// src/routes/tracking.ts
r.post('/experiences', async (req, res) => {
    let { universeId, placeId, name, creatorId } = req.body || {};

    if (!universeId && placeId) {
        universeId = await resolveUniverseIdFromPlace(Number(placeId));
    }
    // If a single numeric “id” is provided, try as universe, then as place:
    if (!universeId && req.body?.id) {
        const id = Number(req.body.id);
        // ping /v1/games?universeIds=id to see if it resolves; if not, try place→universe
        try {
            const check = await getGameDetails(id);
            if (check?.name || check?.playing != null) universeId = id;
        } catch { }
        if (!universeId) universeId = await resolveUniverseIdFromPlace(id);
    }

    if (!universeId) return res.status(400).json({ error: 'Provide universeId or a resolvable placeId/id' });

    const db = getDb();
    db.prepare(
        `INSERT INTO universes (universe_id, name, is_tracked, created_at)
     VALUES (?, ?, 1, datetime('now'))
     ON CONFLICT(universe_id) DO UPDATE SET is_tracked=1, name=COALESCE(excluded.name, universes.name)`
    ).run(universeId, name ?? null);

    res.json({ ok: true, universeId });
});

r.delete('/experiences/:universeId', (req, res) => {
    const id = Number(req.params.universeId);
    const db = getDb();
    db.prepare(`UPDATE universes SET is_tracked=0 WHERE universe_id=?`).run(id);
    return res.json({ ok: true });
});

export default r;