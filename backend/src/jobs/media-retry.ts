import { getDb } from '../lib/db.js';
import { nowIso } from '../lib/time.js';
import { getGameMedia } from '../fetchers/media.js';
import CLIProgress from 'cli-progress';

export async function runMediaRetry(options: { dryRun?: boolean, concurrency?: number } = {}) {
  const db = getDb();
  const useProgress = Boolean(process.stdout.isTTY && !process.env.NO_PROGRESS);
  const lastPath = 'data/media-sync-last-run.json';
  let summary: any;
  try {
    const fs = await import('fs');
    summary = JSON.parse(fs.readFileSync(lastPath, 'utf8'));
  } catch (e) {
    console.warn('[media-retry] no last-run summary found at', lastPath);
    return;
  }

  const toRetry: number[] = Array.isArray(summary?.failures) ? summary.failures.map((f:any) => f.universe_id) : [];
  if (!toRetry.length) {
    console.log('[media-retry] nothing to retry');
    return;
  }

  console.log('[media-retry] start, will retry', toRetry.length, 'universes');
  const bar = useProgress ? new CLIProgress.SingleBar({}, CLIProgress.Presets.shades_classic) : null;
  if (bar) bar.start(toRetry.length, 0);

  let success = 0;
  let failed = 0;
  const failures: Array<{ universe_id:number, error:string }> = [];

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

  const now = nowIso();

  for (const universe_id of toRetry) {
    if (bar) {
      bar.increment();
      if (toRetry.length < 50 || bar.value % 50 === 0) console.log('[media-retry] processing', universe_id, `(${bar.value}/${toRetry.length})`);
    }
    try {
      if (options.dryRun) {
        success++;
        continue;
      }
      const before = db.prepare(`SELECT media_type, media_id FROM universes_media WHERE universe_id=?`).all(universe_id) as any[];
      const beforeSet = new Set(before.map(b => `${b.media_type}:${b.media_id}`));
      const items = await getGameMedia(universe_id);
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
      console.warn('[media-retry] failed', universe_id, msg);
      // append persistent failure entries
      try {
        const fs = await import('fs');
        const path = 'data/media-sync-failures.jsonl';
        try { fs.mkdirSync('data', { recursive: true }); } catch {}
        const entry = { ts: nowIso(), runId: Date.now(), universe_id, error: msg };
        fs.appendFileSync(path, JSON.stringify(entry) + '\n');
      } catch (err) {
        console.warn('[media-retry] failed to append failure', String((err as Error).message || err));
      }
    }
  }

  if (bar) bar.stop();
  console.log('[media-retry] complete', `success=${success}`, `failed=${failed}`);
  // write a small summary
  try {
    const fs = await import('fs');
    const out = { ts: nowIso(), total: toRetry.length, success, failed, failures };
    fs.writeFileSync('data/media-retry-last-run.json', JSON.stringify(out, null, 2));
    console.log('[media-retry] wrote summary data/media-retry-last-run.json');
  } catch (e) {
    console.warn('[media-retry] failed to write summary', String((e as Error).message || e));
  }
}

export default runMediaRetry;
