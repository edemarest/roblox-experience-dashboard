type Any = Record<string, any>;

// Simple retry with exponential backoff + jitter for transient HTTP errors (429/5xx)
async function getJson(url: string, attempts = 4, baseMs = 250) {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: { 'accept': 'application/json' } });
      if (!r.ok) {
        const status = r.status;
        const body = await r.text().catch(() => '');
        const err = new Error(`HTTP ${status} ${url} ${body ? '- ' + body.slice(0,200) : ''}`);
        // Retry on 429 or 5xx
        if (status === 429 || (status >= 500 && status < 600)) throw err;
        throw err;
      }
      return r.json() as Promise<Any>;
    } catch (e) {
      lastErr = e;
      // if last attempt, break
      if (i === attempts - 1) break;
      // exponential backoff with jitter
      const backoff = baseMs * Math.pow(2, i);
      const jitter = Math.floor(Math.random() * baseMs);
      const wait = backoff + jitter;
      await new Promise(res => setTimeout(res, wait));
    }
  }
  throw lastErr;
}
export async function getGameMedia(universeId: number) {
  const j = await getJson(`https://games.roblox.com/v1/games/${universeId}/media`);
  const arr: Any[] = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
  return arr.map((x) => ({
    mediaType: x?.type ?? x?.mediaType ?? 'Image',
    mediaId: String(x?.id ?? x?.imageId ?? x?.videoId ?? ''),
    url: x?.imageUrl ?? x?.videoUrl ?? x?.thumbnailUrl ?? null,
  }));
}
