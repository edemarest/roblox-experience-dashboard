import { nowIso } from '../lib/time.js';

const BADGES_BASE = 'https://badges.roblox.com';

type Any = Record<string, any>;

async function getJson(url: string) {
  const r = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json() as Promise<Any>;
}

export async function listBadgesForUniverse(universeId: number) {
  let cursor: string | null = null;
  const out: Any[] = [];
  do {
    const u = new URL(`${BADGES_BASE}/v1/universes/${universeId}/badges`);
    u.searchParams.set('limit', '100');
    u.searchParams.set('sortOrder', 'Asc');
    if (cursor) u.searchParams.set('cursor', cursor);
    const j = await getJson(u.toString());
    const data = Array.isArray(j?.data) ? j.data : [];
    out.push(...data);
    cursor = j?.nextPageCursor ?? null;
  } while (cursor);
  return out;
}

export async function getBadge(badgeId: number) {
  const j = await getJson(`${BADGES_BASE}/v1/badges/${badgeId}`);
  const awarded = j?.statistics?.awardedCount ?? null;
  return {
    badgeId,
    name: j?.name ?? null,
    description: j?.description ?? null,
    enabled: j?.enabled ? 1 : 0,
    iconImageId: j?.iconImageId ?? null,
    created: j?.created ?? null,
    updated: j?.updated ?? null,
    awardedCount: typeof awarded === 'number' ? awarded : null,
    asOf: nowIso(),
  };
}
