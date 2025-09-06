type Any = Record<string, any>;
async function getJson(url: string) {
  const r = await fetch(url, { headers: { 'accept': 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json() as Promise<Any>;
}

/** sizes like '150x150','256x256','512x512' */
export async function getGameIcons(universeIds: number[], size='150x150') {
  if (universeIds.length === 0) return [];
  const u = new URL('https://thumbnails.roblox.com/v1/games/icons');
  u.searchParams.set('format', 'Png');
  u.searchParams.set('isCircular', 'false');
  u.searchParams.set('size', size);
  u.searchParams.set('universeIds', universeIds.join(','));
  const j = await getJson(u.toString());
  const data: Any[] = Array.isArray(j?.data) ? j.data : [];
  return data.map((d) => ({
    universeId: d?.targetId,
    size,
    url: d?.imageUrl ?? null,
    state: d?.state ?? null
  })).filter(x => x.universeId && x.url);
}
