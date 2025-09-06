// src/fetchers/roblox.ts
// Server-side only. Uses public Roblox endpoints.
// No auth needed for these specific calls.

const GAMES_API = process.env.ROBLOX_GAMES_API || 'https://games.roblox.com';
const REQ_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12000);


async function getJson(url: string, attempt = 1): Promise<any> {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), REQ_TIMEOUT_MS);
    try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (res.status === 429 || (res.status >= 500 && attempt < 3)) {
            // simple retry/backoff
            await new Promise(r => setTimeout(r, 250 * attempt));
            return getJson(url, attempt + 1);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return await res.json();
    } finally {
        clearTimeout(to);
    }
}

// Pulls game details (playing, visits) and some metadata
export async function getGameDetails(universeId: number) {
    // GET /v1/games?universeIds=...
    const url = `${GAMES_API}/v1/games?universeIds=${universeId}`;
    const json = await getJson(url);

    const item =
        Array.isArray(json?.data) &&
        json.data.find((d: any) => d?.id === universeId || d?.universeId === universeId);

    // Shape is defensive (fields can vary)
    const name: string | null = item?.name ?? null;
    const description: string | null = item?.description ?? null;
    const playing: number | null = typeof item?.playing === 'number' ? item.playing : null;
    const visitsTotal: number | null = typeof item?.visits === 'number' ? item.visits : null;
    const serverSize: number | null = typeof item?.maxPlayers === 'number' ? item.maxPlayers : null;
    const creatorType = item?.creator?.type ?? item?.creatorType ?? null; // 'User'|'Group'
    const creatorId = item?.creator?.id ?? item?.creatorTargetId ?? null;
    const creatorName = item?.creator?.name ?? item?.creatorName ?? null;
    return { name, description, playing, visitsTotal, serverSize, creatorType, creatorId, creatorName };
}

// Up/Down votes
export async function getVotes(universeId: number) {
    // GET /v1/games/votes?universeIds=...
    const url = `${GAMES_API}/v1/games/votes?universeIds=${universeId}`;
    const json = await getJson(url);

    const item =
        Array.isArray(json?.data) &&
        json.data.find((d: any) => d?.id === universeId || d?.universeId === universeId);

    const up = typeof item?.upVotes === 'number' ? item.upVotes : null;
    const down = typeof item?.downVotes === 'number' ? item.downVotes : null;
    return { up, down };
}

// Favorites total
export async function getFavorites(universeId: number) {
    const url = `${GAMES_API}/v1/games/${universeId}/favorites/count`;
    try {
        const json = await getJson(url);
        const favoritesTotal =
            typeof json?.favoritesCount === 'number'
                ? json.favoritesCount
                : typeof json?.count === 'number'
                    ? json.count
                    : null;
        return { favoritesTotal };
    } catch (e: any) {
        // If the ID was actually a placeId or bogus, Roblox returns 404.
        // Treat it as “unknown” instead of killing the whole job.
        if (String(e?.message || '').includes('HTTP 404')) {
            return { favoritesTotal: null };
        }
        throw e;
    }
}

// (Optional helper) Resolve a universeId from a placeId.
// Tries two public endpoints; use whichever responds.
export async function resolveUniverseIdFromPlace(placeId: number) {
    // Option A (Open Cloud-style)
    try {
        const j = await getJson(`https://apis.roblox.com/universes/v1/places/${placeId}/universe`);
        if (typeof j?.universeId === 'number') return j.universeId as number;
    } catch (_) { }

    // Option B (legacy web)
    try {
        const j = await getJson(`${GAMES_API}/v1/games/multiget-place-details?placeIds=${placeId}`);
        const item = Array.isArray(j) ? j[0] : Array.isArray(j?.data) ? j.data[0] : null;
        if (typeof item?.universeId === 'number') return item.universeId as number;
    } catch (_) { }

    return null;
}

export async function getGroup(groupId: number) {
    const j = await getJson(`https://groups.roblox.com/v1/groups/${groupId}`);
    return { name: j?.name ?? null };
}
export async function getUser(userId: number) {
    const j = await getJson(`https://users.roblox.com/v1/users/${userId}`);
    return { name: j?.name ?? null };
}
