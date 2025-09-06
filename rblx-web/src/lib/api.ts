export type UniverseShort = {
  universe_id: number;
  name: string;
  icon_url?: string | null;
  players_now?: number;
  favorites?: number;
  last_seen_at?: string | null;
};

export type ExperienceDetail = {
  universe_id: number;
  name: string;
  description?: string | null;
  icon_url?: string | null;
  players_now?: number;
  favorites?: number;
  created_at?: string | null;
  updated_at?: string | null;
  is_tracked?: boolean;
  snapshot?: {
    asOf: string;
    playing: number | null;
    visitsTotal: number | null;
    favoritesTotal: number | null;
    votes: { up: number | null; down: number | null };
    likeRatio?: number | null;
    wilsonScore?: number | null;
  };
  derived?: { estimatedServers?: number | null };
};

export type Badge = {
  badgeId: number;
  name: string;
  description?: string | null;
  enabled?: number | null;
  iconImageId?: number | null;
  iconUrl?: string | null;
  created?: string | null;
  updated?: string | null;
};

export type MediaItem = {
  mediaType: string;
  mediaId: number;
  url: string;
  lastSeenAt?: string | null;
};

const API = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000';

async function safeJson(r: Response) {
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function getLiveNow(limit = 12): Promise<UniverseShort[]> {
  const r = await fetch(`${API}/api/v1/universes?order=players&limit=${limit}`);
  const json = await safeJson(r);
  // expect { items: [...] } or array or { items, cursor }
  const arr = Array.isArray(json) ? json : json.items ?? [];
  return arr.map((u: any) => ({
    universe_id: Number(u.universe_id ?? u.universeId ?? u.id),
    name: u.name ?? u.title ?? 'Untitled',
    icon_url: u.icon_url ?? u.iconUrl ?? u.icon ?? null,
    players_now: Number(u.players_now ?? u.players_now ?? u.players ?? 0),
    favorites: Number(u.favorites ?? u.favorites ?? 0),
    last_seen_at: u.last_seen_at ?? u.lastSeenAt ?? null,
  }));
}

export async function getUniversesPage(order = 'players', cursor?: string, limit = 24): Promise<{ items: UniverseShort[]; cursor: string | null }> {
  const q = new URLSearchParams(); q.set('order', order); q.set('limit', String(limit)); if (cursor) q.set('cursor', cursor);
  const r = await fetch(`${API}/api/v1/universes?${q.toString()}`);
  const j = await safeJson(r);
  const arr = j.items ?? [];
  const items: UniverseShort[] = arr.map((u: any) => ({
    universe_id: Number(u.universe_id ?? u.universeId ?? u.id),
    name: u.name ?? u.title ?? 'Untitled',
    icon_url: u.icon_url ?? u.iconUrl ?? u.icon ?? null,
    players_now: Number(u.players_now ?? u.players ?? 0),
    favorites: Number(u.favorites ?? 0),
    last_seen_at: u.last_seen_at ?? u.lastSeenAt ?? null,
  }));

  return { items, cursor: j.next_cursor ?? j.cursor ?? null };
}

export async function getRadarTop(limit = 10): Promise<UniverseShort[]> {
  const r = await fetch(`${API}/api/v1/radar/breakouts?limit=${limit}`);
  const json = await safeJson(r);
  const arr = json.items ?? [];
  return arr.map((u: any) => ({
    universe_id: Number(u.universe_id ?? u.universeId ?? u.id),
    name: u.name ?? null,
    icon_url: u.icon_url ?? u.iconUrl ?? null,
    players_now: Number(u.players_now ?? u.players ?? 0),
    favorites: Number(u.favorites ?? 0),
    last_seen_at: u.last_seen_at ?? null,
  }));
}

export async function resolveAndTrack(input: string): Promise<{ universe_id: number } | null> {
  const r = await fetch(`${API}/api/v1/experiences/resolve`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input, track: true })
  });
  if (!r.ok) return null;
  const j = await r.json();
  return { universe_id: Number(j.universe_id ?? j.universeId ?? j.id) };
}

export async function getExperience(universeId: number): Promise<ExperienceDetail> {
  const r = await fetch(`${API}/api/v1/experiences/${universeId}`);
  const j = await safeJson(r);

  // Backend returns a full "view" with `header` and `snapshot`.
  // Accept either the flattened shape or the nested view shape.
  const header = j.header ?? j.Header ?? null;
  const snapshot = j.snapshot ?? j.Snapshot ?? null;

  const name = j.name ?? j.title ?? header?.name ?? 'Untitled';
  const description = j.description ?? j.desc ?? header?.description ?? null;
  const icon = j.icon_url ?? j.iconUrl ?? j.icon ?? header?.icon_url ?? null;
  const playersNow = Number(j.players_now ?? j.players ?? snapshot?.playing ?? 0);
  const favorites = Number(j.favorites ?? snapshot?.favoritesTotal ?? j.favorites ?? 0);
  const createdAt = j.created_at ?? j.createdAt ?? header?.createdAt ?? null;
  const updatedAt = j.updated_at ?? j.updatedAt ?? header?.updatedAt ?? null;
  const isTracked = j.is_tracked ?? j.isTracked ?? header?.isTracked ?? false;

  return {
    universe_id: Number(j.universe_id ?? j.universeId ?? j.id ?? universeId),
    name,
    description,
    icon_url: icon,
    players_now: playersNow,
    favorites,
    created_at: createdAt,
    updated_at: updatedAt,
    is_tracked: isTracked,
    snapshot: snapshot
      ? {
          asOf: snapshot.asOf ?? snapshot.asOf,
          playing: snapshot.playing ?? null,
          visitsTotal: snapshot.visitsTotal ?? snapshot.visits_total ?? null,
          favoritesTotal: snapshot.favoritesTotal ?? snapshot.favorites_total ?? null,
          votes: snapshot.votes ?? { up: snapshot.up ?? null, down: snapshot.down ?? null },
          likeRatio: snapshot.likeRatio ?? snapshot.like_ratio ?? null,
          wilsonScore: snapshot.wilsonScore ?? snapshot.wilson_score ?? null,
        }
      : undefined,
    derived: j.derived ?? j.Derived ?? header?.derived ?? undefined,
  };
}

export async function getExperienceHistory(universeId: number, metric = 'playing', window = '24h') {
  const q = new URLSearchParams(); q.set('metric', metric); q.set('window', window);
  const r = await fetch(`${API}/api/v1/experiences/${universeId}/history?${q.toString()}`);
  const j = await safeJson(r);
  // expects { series: [[ts, value], ...] }
  return j.series ?? [];
}

export async function getExperienceBadges(universeId: number, cursor?: number, limit = 60): Promise<{ items: Badge[]; nextCursor: number | null }> {
  const q = new URLSearchParams(); q.set('limit', String(limit)); if (cursor) q.set('cursor', String(cursor));
  const r = await fetch(`${API}/api/v1/experiences/${universeId}/badges?${q.toString()}`);
  const j = await safeJson(r);
  const items: Badge[] = (j.items ?? []).map((b: any) => ({
    badgeId: Number(b.badgeId ?? b.badge_id ?? b.id),
    name: b.name,
    description: b.description ?? null,
    enabled: b.enabled,
    iconImageId: b.iconImageId ?? b.icon_image_id ?? null,
  iconUrl: b.iconUrl ?? b.icon_url ?? null,
    created: b.created ?? null,
    updated: b.updated ?? null,
  }));
  return { items, nextCursor: j.nextCursor ?? null };
}

export async function getExperienceMedia(universeId: number): Promise<MediaItem[]> {
  const r = await fetch(`${API}/api/v1/experiences/${universeId}/media`);
  const j = await safeJson(r);
  return (j.items ?? []).map((m: any) => ({ mediaType: m.mediaType ?? m.media_type, mediaId: Number(m.mediaId ?? m.media_id), url: m.url, lastSeenAt: m.lastSeenAt ?? m.last_seen_at ?? null }));
}

export async function getExperienceIcons(universeId: number): Promise<Array<{ size?: number; url?: string; lastSeenAt?: string }>> {
  const r = await fetch(`${API}/api/v1/experiences/${universeId}/icons`);
  const j = await safeJson(r);
  return (j.items ?? []).map((i: any) => ({ size: i.size ?? null, url: i.url ?? null, lastSeenAt: i.lastSeenAt ?? i.last_seen_at ?? null }));
}
