import { Router } from 'express';
import { z } from 'zod';
import { buildExperienceView, ensureUniverse, getHistory, searchExperiences } from '../services/experiences.js';
import { resolveUniverseIdFromPlace } from '../fetchers/roblox.js';
import { getDb } from '../lib/db.js';
import path from 'path';
import fs from 'fs';

const r = Router();

r.get('/search', (req, res) => {
    const q = String(req.query.q || '');
    const limit = Number(req.query.limit || 20);
    const results = searchExperiences(q, limit);
    res.json({ results });
});

// POST /api/v1/experiences/resolve { input: string, track?: boolean }
r.post('/resolve', async (req, res) => {
    const { input, track } = req.body || {};
    if (!input) return res.status(400).json({ error: 'input required' });

    const raw = String(input).trim();
    const numeric = Number(raw);
    const db = getDb();

    async function ensureTrack(uid: number) {
        if (!track) return;
        db.prepare(`INSERT INTO universes (universe_id, is_tracked, created_at)
                                VALUES (?, 1, datetime('now'))
                                ON CONFLICT(universe_id) DO UPDATE SET is_tracked=1`).run(uid);
    }

    // try universe id directly
    if (Number.isFinite(numeric) && numeric > 0) {
        await ensureTrack(numeric);
        return res.json({ universeId: numeric });
    }

    // try to parse placeId from URL
    const placeMatch = raw.match(/\/games\/(\d+)/) || raw.match(/placeId=(\d+)/);
    if (placeMatch) {
        const placeId = Number(placeMatch[1]);
        const u = await resolveUniverseIdFromPlace(placeId);
        if (u) {
            await ensureTrack(u);
            return res.json({ universeId: u });
        }
        return res.status(404).json({ error: 'universe not found for placeId' });
    }

    return res.status(400).json({ error: 'unable to resolve; provide universeId or place URL' });
});

r.get('/:universeId', async (req, res) => {
    const id = Number(req.params.universeId);
    await ensureUniverse(id); // make sure a row exists

    const view = buildExperienceView(id) as any; // coerce from possible 'void'
    if (view == null) {
        res.status(404).json({ error: 'Universe not found' });
        return;
    }

    res.json(view);
});


r.get('/:universeId/history', (req, res) => {
    const id = Number(req.params.universeId);
    const metric = String(req.query.metric || 'playing') as any;
    const window = String(req.query.window || '24h');
    const hours = window.endsWith('d') ? Number(window.replace('d', '')) * 24 : Number(window.replace('h', ''));
    const series = getHistory(id, metric, hours || 24);
    res.json({ series });
});

// GET /api/v1/experiences/:id/badges
r.get('/:id/badges', (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const limit = Math.min(200, Number(req.query.limit ?? 60));
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;

    const rows = db.prepare(
        `SELECT badge_id AS badgeId, name, description, enabled, icon_image_id AS iconImageId, created, updated
         FROM badges
         WHERE universe_id = ?
         ${cursor ? 'AND badge_id > ?' : ''}
         ORDER BY badge_id
         LIMIT ?`
    ).all(cursor ? [id, cursor, limit] : [id, limit]);

    const nextCursor = rows.length ? rows.at(-1).badgeId : null;
    const items = rows.map((r:any) => {
        // Prefer persisted icon_url column when available (populated by badges-sync via thumbnails API)
        const persisted = r.icon_url ?? r.iconUrl ?? null;
        if (persisted && typeof persisted === 'string' && persisted.startsWith('http')) {
            // Rewrite to proxied endpoint so browser won't be blocked by Roblox CDN policies
            const proxyUrl = `/api/v1/images/proxy?src=${encodeURIComponent(persisted)}`;
            return { ...r, iconUrl: proxyUrl };
        }
        // Fallback: construct a naive CDN fallback if we have an icon_image_id
        const iconId = r.iconImageId ?? r.icon_image_id ?? null;
        let iconUrl = null;
        if (iconId && /^[0-9]+$/.test(String(iconId))) {
            iconUrl = `https://t0.rbxcdn.com/${String(iconId)}`;
        }
        return { ...r, iconUrl };
    });
    res.json({ items, nextCursor });
});

// Simple image proxy with disk cache to work around CDN blocking for some assets.
// Example: GET /api/v1/images/proxy?src=https%3A%2F%2F...image.png
r.get('/images/proxy', async (req, res) => {
    const src = String(req.query.src || '');
    if (!src) return res.status(400).json({ error: 'src required' });
    try {
        // simple filename derived from a hash of the src
        const crypto = await import('crypto');
        const h = crypto.createHash('sha1').update(src).digest('hex');
        const cacheDir = path.resolve(process.cwd(), 'data', 'image-cache');
        try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {}
        const cachePath = path.join(cacheDir, h);
        // If cached file exists, stream it
        if (fs.existsSync(cachePath)) {
            const stat = fs.statSync(cachePath);
            res.setHeader('content-length', String(stat.size));
            res.setHeader('cache-control', 'public, max-age=86400');
            const stream = fs.createReadStream(cachePath);
            return stream.pipe(res);
        }

        // Fetch the remote image with a short timeout and size limit
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const r = await fetch(src, { signal: controller.signal, headers: { 'User-Agent': 'roblox-stats-proxy/1.0' } });
        clearTimeout(timeout);
        if (!r.ok) return res.status(502).json({ error: `upstream ${r.status}` });
        const contentType = r.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('content-type', contentType);
        res.setHeader('cache-control', 'public, max-age=86400');

        // Stream to disk while piping to client
        const dest = fs.createWriteStream(cachePath);
                const body = r.body;
                if (!body) return res.status(502).json({ error: 'no body' });
                // Use Node pipeline to stream response to both file and client
                const { pipeline } = await import('stream');
                const { promisify } = await import('util');
                const pipe = promisify(pipeline);

                // In Node 18+, response.body may be a web.ReadableStream; convert if necessary
                let nodeStream: any = body as any;
                try {
                    const { Readable } = await import('stream');
                    if (typeof (body as any).getReader === 'function') {
                        // web.ReadableStream -> Node Readable
                        nodeStream = Readable.from((body as any));
                    }
                } catch {}

                // Limit total bytes to 2MB when saving to disk
                const MAX = 2 * 1024 * 1024;
                let total = 0;
                const sizeLimited = new (await import('stream')).Transform({
                    transform(chunk, _enc, cb) {
                        total += chunk.length;
                        if (total > MAX) return cb(new Error('exceeded max size'));
                        cb(null, chunk);
                    }
                });

                // Pipe: nodeStream -> tee to dest file and to res
                // We'll first pipe to dest via sizeLimited, then also pipe to res by duplicating the stream using PassThrough
                const { PassThrough } = await import('stream');
                const tee = new PassThrough();
                // start piping concurrently
                const writePromise = pipe(nodeStream, sizeLimited, dest).catch(() => {});
                const clientPromise = pipe(nodeStream, tee, res as any).catch(() => {});
                // Also pipe sizeLimited into cache file (already done) — ensure both promises settle
                await Promise.allSettled([writePromise, clientPromise]);
    } catch (e) {
        return res.status(502).json({ error: String((e as Error).message || e) });
    }
});

// GET /api/v1/experiences/:id/badges/series?badgeId=&window=30d
r.get('/:id/badges/series', (req, res) => {
    const db = getDb();
    const badgeId = Number(req.query.badgeId);
    const rows = db.prepare(
        `SELECT ts, awarded_count AS v FROM badge_stats_hourly WHERE badge_id=? ORDER BY ts`
    ).all(badgeId) as Array<{ ts:string; v:number|null }>;
    res.json({ series: rows.map(r => [r.ts, r.v]) });
});

// GET /api/v1/experiences/:id/media
r.get('/:id/media', (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const rows = db.prepare(
        `SELECT media_type AS mediaType, media_id AS mediaId, url, last_seen_at AS lastSeenAt
         FROM universes_media WHERE universe_id=? ORDER BY media_type, media_id`
    ).all(id);
    // Ensure every media item has a usable URL. If the DB row lacks a url, attempt to build
    // a reasonable CDN URL from the media type and id. This keeps thumbnails working when
    // sync jobs store only media ids.
    const items = rows.map((r: any) => {
        let url = r.url ?? null;
        const type = String(r.mediaType || 'Image');
        const mid = String(r.mediaId || '');
        if (!url) {
            // Common Roblox CDN fallbacks:
            // Images: https://t0.rbxcdn.com/<imageId>
            // Videos: use thumbnails endpoint: https://tr.rbxcdn.com/<videoId>/thumbnail/384x216
            try {
                if (type.toLowerCase().includes('image') && /^[0-9]+$/.test(mid)) {
                    url = `https://t0.rbxcdn.com/${mid}`;
                } else if (type.toLowerCase().includes('video') && /^[0-9]+$/.test(mid)) {
                    url = `https://tr.rbxcdn.com/${mid}/thumbnail/384x216`;
                } else {
                    // generic fallback to Roblox thumbnails service (may 404 for unknown ids)
                    if (/^[0-9]+$/.test(mid)) url = `https://t0.rbxcdn.com/${mid}`;
                }
            } catch (e) {
                url = null;
            }
        }
        return { mediaType: r.mediaType, mediaId: r.mediaId, url, lastSeenAt: r.lastSeenAt };
    });
    res.json({ items });
});

// GET /api/v1/experiences/:id/icons
r.get('/:id/icons', (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const rows = db.prepare(
        `SELECT size, url, last_seen_at AS lastSeenAt FROM universe_icons WHERE universe_id=? ORDER BY size`
    ).all(id);
    res.json({ items: rows });
});

// GET /api/v1/experiences/:id/changelog?limit=100
r.get('/:id/changelog', (req, res) => {
    const db = getDb();
    const id = Number(req.params.id);
    const limit = Math.min(500, Number(req.query.limit ?? 100));
    const rows = db.prepare(
        `SELECT id, ts, kind, before_json AS before, after_json AS after
         FROM universe_changelog WHERE universe_id=? ORDER BY ts DESC, id DESC LIMIT ?`
    ).all(id, limit);
    res.json({ items: rows });
});

r.get('/compare', (req, res) => {
    const ids = String(req.query.ids || '')
        .split(',')
        .map(s => Number(s.trim()))
        .filter(Boolean)
        .slice(0, 4);
    const views = ids.map(id => buildExperienceView(id)).filter(Boolean);
    res.json({ items: views });
});

export default r;