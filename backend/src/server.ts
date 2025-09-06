import express from 'express';
import cors from 'cors';
import 'dotenv/config';
console.log('[boot] 1: imports loaded');

import { getDb } from './lib/db.js';
import experiences from './routes/experiences.js';
import radar from './routes/radar.js';
import tracking from './routes/tracking.js';
import admin from './routes/admin.js';
import universes from './routes/universes.js';


console.log('[boot] 2: routes imported');

console.log('[app] DB_PATH =', process.env.DB_PATH || './data/app.db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/v1/experiences', experiences);
app.use('/api/v1/radar', radar);
app.use('/api/v1/tracking', tracking);
app.use('/api/v1/admin', admin);
app.use('/api/v1/universes', universes);

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

// Ensure DB opens early
getDb();
console.log('[boot] 3: DB opened, about to listen');

app.listen(PORT, HOST, () => {
  console.log(`[app] API listening on http://${HOST}:${PORT}`);
});
