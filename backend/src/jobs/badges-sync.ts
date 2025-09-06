import { getDb } from '../lib/db.js';
import { nowIso } from '../lib/time.js';
import { listBadgesForUniverse, getBadge } from '../fetchers/badges.js';
import CLIProgress from 'cli-progress';

// Compact logging + TTY-aware progress for badges sync

export async function runBadgesSync() {
  const db = getDb();
  const tracked = db.prepare(`SELECT universe_id FROM universes WHERE is_tracked=1`).all() as { universe_id:number }[];
  const useProgress = Boolean(process.stdout.isTTY && !process.env.NO_PROGRESS);
  console.log('[badges-sync] start, universes=', tracked.length, 'progress=', useProgress);
  const bar = useProgress ? new CLIProgress.SingleBar({ clearOnComplete: true }, CLIProgress.Presets.shades_classic) : null;
  if (bar) bar.start(tracked.length, 0);
  let success = 0;
  let failed = 0;

  const upsertBadge = db.prepare(`
    INSERT INTO badges (badge_id, universe_id, name, description, enabled, icon_image_id, icon_url, created, updated)
    VALUES (@badge_id, @universe_id, @name, @description, @enabled, @icon_image_id, @icon_url, @created, @updated)
    ON CONFLICT(badge_id) DO UPDATE SET
      universe_id=excluded.universe_id,
      name=excluded.name,
      description=excluded.description,
      enabled=excluded.enabled,
      icon_image_id=excluded.icon_image_id,
      icon_url=COALESCE(excluded.icon_url, badges.icon_url),
      created=COALESCE(excluded.created, badges.created),
      updated=excluded.updated
  `);

  const insertStats = db.prepare(`
    INSERT OR REPLACE INTO badge_stats_hourly (ts, badge_id, awarded_count)
    VALUES (?, ?, ?)
  `);

  const insertChange = db.prepare(`
    INSERT INTO universe_changelog (ts, universe_id, kind, before_json, after_json)
    VALUES (?, ?, ?, ?, ?)
  `);

  try {
    for (let i = 0; i < tracked.length; i++) {
      const universe_id = tracked[i].universe_id;
      const percentNow = Math.round(((i + 1) / tracked.length) * 100);
      try { console.log(JSON.stringify({ kind: 'progress', percent: percentNow, universe_id, msg: `processing ${universe_id} (${i+1}/${tracked.length})` })); } catch {}
      
      try {
        // per-universe progress
        if (bar) {
          bar.increment();
          if (tracked.length < 50 || bar.value % 50 === 0) console.log('[badges-sync] processing', universe_id, `(${bar.value}/${tracked.length})`);
        }
        const list = await listBadgesForUniverse(universe_id);
      const before = db.prepare(`SELECT badge_id FROM badges WHERE universe_id=?`).all(universe_id) as { badge_id:number }[];
      const beforeSet = new Set(before.map(b => b.badge_id));

      const tx = db.transaction((rows:any[]) => {
        for (const b of rows) {
          upsertBadge.run({
            badge_id: b.id,
            universe_id,
            name: b.name ?? null,
            description: b.description ?? null,
            enabled: b.enabled ? 1 : 0,
            icon_image_id: b.iconImageId ?? null,
            icon_url: null,
            created: b.created ?? null,
            updated: b.updated ?? null
          });
        }
      });
      tx(list);

      // stats (awardedCount) for each badge
      const ts = nowIso();
      for (const b of list) {
        try {
          const detail = await getBadge(b.id);
          if (detail.awardedCount != null) insertStats.run(ts, b.id, detail.awardedCount);
        } catch {}
      }

      // After inserting rows, attempt to resolve icon URLs for badges that have icon_image_id but no icon_url
      try {
        const toResolve = db.prepare(`SELECT badge_id, icon_image_id FROM badges WHERE universe_id=? AND icon_image_id IS NOT NULL AND (icon_url IS NULL OR icon_url='')`).all(universe_id) as Array<{ badge_id:number; icon_image_id:number }>;
        if (toResolve.length) {
          // Batch ids into groups for thumbnails API
          const batches: string[][] = [];
          const ids = toResolve.map(r => String(r.icon_image_id));
          for (let i = 0; i < ids.length; i += 50) batches.push(ids.slice(i, i + 50));
          for (const batch of batches) {
            try {
              const idsParam = batch.join(',');
              const thumbUrl = `https://thumbnails.roblox.com/v1/assets?assetIds=${idsParam}&size=48x48&format=png&isCircular=false`;
              const resp = await fetch(thumbUrl, { headers: { accept: 'application/json' } });
              if (resp.ok) {
                const j = await resp.json() as any;
                for (const d of j.data || []) {
                  const mid = String(d.targetId);
                  const item = toResolve.find(t => String(t.icon_image_id) === mid);
                  if (item && d.imageUrl) {
                    db.prepare(`UPDATE badges SET icon_url=? WHERE badge_id=?`).run(d.imageUrl, item.badge_id);
                  }
                }
              }
            } catch (e) {
              // ignore per-batch failures
            }
            if (batch !== batches.at(-1)) await new Promise(res => setTimeout(res, 150));
          }
        }
      } catch (e) {
        // ignore resolution errors
      }

      // changelog (added/removed)
      const afterSet = new Set(list.map((b:any) => b.id));
      const added = Array.from(afterSet).filter(id => !beforeSet.has(id));
      const removed = Array.from(beforeSet).filter(id => !afterSet.has(id));
      if (added.length)  insertChange.run(ts, universe_id, 'BADGES_ADDED',  JSON.stringify([]), JSON.stringify(added));
      if (removed.length) insertChange.run(ts, universe_id, 'BADGES_REMOVED', JSON.stringify(removed), JSON.stringify([]));

        success++;
      } catch (e) {
        failed++;
        console.warn('[badges-sync] skip universe', universe_id, String((e as Error).message || e));
      }
    }
  } finally {
    if (bar) bar.stop();
    console.log('[badges-sync] complete', `success=${success}`, `failed=${failed}`);
  }
}
