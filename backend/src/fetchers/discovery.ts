import crypto from 'node:crypto';

type Any = Record<string, any>;

const EXPLORE_BASE = 'https://apis.roblox.com/explore-api/v1';

const defaultHeaders = {
  'accept': 'application/json',
  // some endpoints behave better with these hints:
  'accept-language': 'en-US,en;q=0.9',
  'origin': 'https://www.roblox.com',
  'referer': 'https://www.roblox.com/discover',
  // optional UA; helps some CDNs
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
};

async function getJson(url: string) {
  const r = await fetch(url, { headers: defaultHeaders });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json() as Promise<Any>;
}

export async function getSorts(debug = false) {
  const sessionId = crypto.randomUUID();
  const url = `${EXPLORE_BASE}/get-sorts?sessionId=${sessionId}&platformType=PC`;
  const j = await getJson(url);

  // try multiple shapes
  const sorts: Any[] =
    (Array.isArray(j?.sorts) && j.sorts) ||
    (Array.isArray(j?.data?.sorts) && j.data.sorts) ||
    (Array.isArray(j?.pageData?.sorts) && j.pageData.sorts) ||
    [];

  const mapped = sorts.map((s) => ({
    id: String(s?.id ?? s?.sortId ?? s?.token ?? ''),
    name: String(s?.displayName ?? s?.name ?? s?.title ?? ''),
    raw: s,
  }));

  if (debug) {
    console.log('[discover] get-sorts count=', mapped.length);
    console.log('[discover] first sort keys=', mapped[0] ? Object.keys(mapped[0].raw || {}) : []);
  }

  return { sessionId, sorts: mapped };
}

export async function getSortContent(sessionId: string, sortId: string, debug = false) {
  const url = `${EXPLORE_BASE}/get-sort-content?sessionId=${sessionId}&sortId=${encodeURIComponent(sortId)}`;
  const j = await getJson(url);

  // try multiple shapes
  const items: Any[] =
    (Array.isArray(j?.contents) && j.contents) ||
    (Array.isArray(j?.games) && j.games) ||
    (Array.isArray(j?.data?.contents) && j.data.contents) ||
    (Array.isArray(j?.data?.games) && j.data.games) ||
    [];

  const ids = new Set<number>();
  for (const it of items) {
    const n =
      it?.universeId ??
      it?.contentMetadata?.universeId ??
      it?.universe?.id ??
      it?.game?.universeId ??
      it?.gameData?.universeId ??
      undefined;
    if (typeof n === 'number' && Number.isFinite(n)) ids.add(n);
  }

  if (debug) {
    const first = items[0] || {};
    console.log('[discover] sortId=', sortId, 'items=', items.length, 'uids=', ids.size);
    console.log('[discover] first item keys=', Object.keys(first));
  }

  return Array.from(ids);
}

export async function discoverTopUniverseIds(max = 200, debug = false) {
  const { sessionId, sorts } = await getSorts(debug);

  if (sorts.length === 0) {
    if (debug) console.warn('[discover] no sorts returned');
    return [];
  }

  // RELAX selection: try to include many common homepage sorts up to a cap
  const WANT = ['popular', 'top', 'engag', 'up', 'featured', 'home', 'trending', 'recommended'];
  const chosen = sorts.filter((s) => {
    const n = (s.name || '').toLowerCase();
    return WANT.some((w) => n.includes(w));
  });

  const targetSorts = (chosen.length ? chosen : sorts).slice(0, 8); // cap to avoid hammering

  const out = new Set<number>();
  for (const s of targetSorts) {
    try {
      const ids = await getSortContent(sessionId, s.id, debug);
      ids.forEach((id) => out.add(id));
      if (out.size >= max) break;
    } catch (e) {
      if (debug) console.warn('[discover] skip sort', s.name, s.id, String((e as Error).message || e));
    }
  }

  const arr = Array.from(out).slice(0, max);
  if (debug) console.log('[discover] total unique universeIds=', arr.length);
  return arr;
}
