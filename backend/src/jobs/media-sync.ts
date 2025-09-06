import { getDb } from '../lib/db.js';
import { nowIso } from '../lib/time.js';
import { getGameMedia } from '../fetchers/media.js';
import CLIProgress from 'cli-progress';

// Logging + TTY-aware progress for media sync

export async function runMediaSync() {
  const db = getDb();
  const tracked = db.prepare(`SELECT universe_id FROM universes WHERE is_tracked=1`).all() as { universe_id:number }[];
  const useProgress = Boolean(process.stdout.isTTY && !process.env.NO_PROGRESS);
  console.log('[media-sync] start, universes=', tracked.length, 'progress=', useProgress);
  const bar = useProgress ? new CLIProgress.SingleBar({}, CLIProgress.Presets.shades_classic) : null;
  if (bar) bar.start(tracked.length, 0);
  let success = 0;
  let failed = 0;
  const failures: Array<{ universe_id: number, error: string }> = [];

  const upsert = db.prepare(`
    INSERT INTO universes_media (universe_id, media_type, media_id, url, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(universe_id, media_type, media_id) DO UPDATE SET
      url=excluded.url,
      last_seen_at=excluded.last_seen_at
  `);

  const insertChange = db.prepare(`
    INSERT INTO universe_changelog (ts, universe_id, kind, before_json, after_json)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    for (let i = 0; i < tracked.length; i++) {
      const universe_id = tracked[i].universe_id;
      const percentNow = Math.round(((i + 1) / tracked.length) * 100);
      // structured progress update for UI tooling
      try { console.log(JSON.stringify({ kind: 'progress', percent: percentNow, universe_id, msg: `processing ${universe_id} (${i+1}/${tracked.length})` })); } catch {}
      try {
        if (bar) {
          bar.increment();
          if (tracked.length < 50 || bar.value % 50 === 0) console.log('[media-sync] processing', universe_id, `(${bar.value}/${tracked.length})`);
        }
      const before = db.prepare(`SELECT media_type, media_id FROM universes_media WHERE universe_id=?`).all(universe_id) as any[];
      const beforeSet = new Set(before.map(b => `${b.media_type}:${b.media_id}`));

      const now = nowIso();
      const items = await getGameMedia(universe_id);

      // If any items lack a URL, try to resolve thumbnails via Roblox thumbnails API in batches.
      const missing = items.filter(m => !m.url && /^[0-9]+$/.test(String(m.mediaId || '')));
      if (missing.length) {
        // Batch asset ids into groups of 50 to avoid overly long URIs
        const batches: string[][] = [];
        for (let i = 0; i < missing.length; i += 50) batches.push(missing.slice(i, i + 50).map(x => String(x.mediaId)));
        for (const batch of batches) {
          try {
            const idsParam = batch.join(',');
            const thumbUrl = `https://thumbnails.roblox.com/v1/assets?assetIds=${idsParam}&size=384x216&format=png&isCircular=false`;
            const resp = await fetch(thumbUrl, { headers: { accept: 'application/json' } });
            if (resp.ok) {
              const j = await resp.json() as any;
              // j.data[] contains {targetId, state, imageUrl}
              for (const d of j.data || []) {
                const mid = String(d.targetId);
                const item = items.find((it: any) => String(it.mediaId) === mid);
                if (item && d.imageUrl) item.url = d.imageUrl;
              }
            }
          } catch (e) {
            // ignore thumbnail resolution failures for this batch
          }
          // brief pause between batches to be polite
          if (batch !== batches.at(-1)) await new Promise(res => setTimeout(res, 150));
        }
      }

      const tx = db.transaction((it:any[]) => {
        for (const m of it) upsert.run(universe_id, m.mediaType, m.mediaId, m.url ?? null, now);
      });
      tx(items);

      const afterSet = new Set(items.map(m => `${m.mediaType}:${m.mediaId}`));
      const added = Array.from(afterSet).filter(x => !beforeSet.has(x));
      const removed = Array.from(beforeSet).filter(x => !afterSet.has(x));
      if (added.length || removed.length) {
        insertChange.run(now, universe_id, 'MEDIA_CHANGED', JSON.stringify(Array.from(removed)), JSON.stringify(Array.from(added)));
      }
  success++;
      } catch (e) {
        failed++;
        const msg = String((e as Error).message || e);
        failures.push({ universe_id, error: msg });
        console.warn('[media-sync] skip universe', universe_id, msg);
      }
    }
  } finally {
    if (bar) bar.stop();
    console.log('[media-sync] complete', `success=${success}`, `failed=${failed}`);
    // write a small run summary JSON for later retries
    try {
      const fs = await import('fs');
      const out = {
        ts: nowIso(),
        total: tracked.length,
        success,
        failed,
        failures
      };
      const path = 'data/media-sync-last-run.json';
      fs.writeFileSync(path, JSON.stringify(out, null, 2));
      console.log('[media-sync] wrote summary', path);
    } catch (e) {
      console.warn('[media-sync] failed to write summary', String((e as Error).message || e));
    }
    // also append failures to a persistent JSONL file for long-term tracking
    if (failures.length) {
      try {
        const fs = await import('fs');
        const path = 'data/media-sync-failures.jsonl';
        // ensure directory exists
        try { fs.mkdirSync('data', { recursive: true }); } catch {}
        const runId = Date.now();
        const stream = fs.createWriteStream(path, { flags: 'a' });
        for (const f of failures) {
          const entry = {
            ts: nowIso(),
            runId,
            universe_id: f.universe_id,
            error: f.error
          };
          stream.write(JSON.stringify(entry) + '\n');
        }
        stream.end();
        console.log('[media-sync] appended failures to', path);
      } catch (e) {
        console.warn('[media-sync] failed to append failures', String((e as Error).message || e));
      }
    }
  }
}
