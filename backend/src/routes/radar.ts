import { Router } from 'express';
import { getBreakouts } from '../services/radar.js';

const r = Router();

r.get('/breakouts', (req, res) => {
const limit = Number(req.query.limit || 50);
const minVotes = Number(req.query.minVotes || 0);
const items = getBreakouts(limit, minVotes);
res.json({ items });
});

r.get('/hidden-gems', (req, res) => {
// Placeholder: similar to breakouts but with filters
res.json({ items: [] });
});

r.get('/comebacks', (req, res) => {
// Placeholder
res.json({ items: [] });
});

export default r;