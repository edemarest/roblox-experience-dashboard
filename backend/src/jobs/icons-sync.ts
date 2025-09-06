import { getDb } from '../lib/db.js';
import { nowIso } from '../lib/time.js';
import { sha1 } from '../lib/hash.js';
import { getGameIcons } from '../fetchers/thumbnails.js';
import CLIProgress from 'cli-progress';

// Logging + TTY-aware progress for icons sync

const SIZES = ['150x150','256x256','512x512'];

export async function runIconsSync() {
  const db = getDb();
  const tracked = db.prepare(`SELECT universe_id FROM universes WHERE is_tracked=1`).all() as { universe_id:number }[];
  const ids = tracked.map(t => t.universe_id);
  const useProgress = Boolean(process.stdout.isTTY && !process.env.NO_PROGRESS);
  console.log('[icons-sync] start, universes=', ids.length, 'sizes=', SIZES.length, 'progress=', useProgress);
  const sizeBar = useProgress ? new CLIProgress.SingleBar({}, CLIProgress.Presets.shades_classic) : null;
  if (sizeBar) sizeBar.start(ids.length * SIZES.length, 0);
  let success = 0;
  let failed = 0;

  const insertChange = db.prepare(`
    INSERT INTO universe_changelog (ts, universe_id, kind, before_json, after_json)
    VALUES (?, ?, 'ICON_CHANGED', ?, ?)
  `);

  for (const size of SIZES) {
    try {
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i+100);
        const icons = await getGameIcons(chunk, size);
        const now = nowIso();
        const tx = db.transaction(() => {
      for (const ic of icons) {
        if (sizeBar) sizeBar.increment();
            const prev = db.prepare(`SELECT url, url_hash FROM universe_icons WHERE universe_id=? AND size=?`).get(ic.universeId, size) as any;
            const urlHash = sha1(String(ic.url));
            db.prepare(`
              INSERT INTO universe_icons (universe_id, size, url, url_hash, last_seen_at)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(universe_id, size) DO UPDATE SET
                url=excluded.url,
                url_hash=excluded.url_hash,
                last_seen_at=excluded.last_seen_at
            `).run(ic.universeId, size, ic.url, urlHash, now);

            if (prev && prev.url_hash && prev.url_hash !== urlHash) {
              insertChange.run(now, ic.universeId, JSON.stringify({ size, url: prev.url }), JSON.stringify({ size, url: ic.url }));
            }
            success++;
          }
        });
        tx();
      }
    } catch (e) {
      failed++;
      console.warn('[icons-sync]', size, String((e as Error).message || e));
    }
  }
  if (sizeBar) sizeBar.stop();
  console.log('[icons-sync] complete', `success=${success}`, `failed=${failed}`);
}
