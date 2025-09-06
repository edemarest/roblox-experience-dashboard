// src/routes/util.ts
import { Router } from 'express';
import { resolveUniverseIdFromPlace } from '../fetchers/roblox.js';
const r = Router();
r.get('/resolve', async (req, res) => {
  const placeId = Number(req.query.placeId);
  if (!placeId) return res.status(400).json({ error: 'placeId required' });
  const universeId = await resolveUniverseIdFromPlace(placeId);
  res.json({ placeId, universeId });
});
export default r;
