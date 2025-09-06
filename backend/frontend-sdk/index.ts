// frontend-sdk/index.ts
export type TimePoint = [string, number|null];

export type ExperienceView = {
  universeId: number;
  header: {
    universeId: number;
    name: string|null;
    creator: { id: number|null; type: 'USER'|'GROUP'|null; name: string|null };
    serverSize: number|null;
  };
  snapshot: {
    asOf: string;
    playing: number|null;
    visitsTotal: number|null;
    favoritesTotal: number|null;
    votes: { up: number|null; down: number|null };
    likeRatio: number|null;
    wilsonScore: number|null;
  };
  sparklines: {
    playing24h: TimePoint[];
    playing7d: TimePoint[];
    favorites24h: TimePoint[];
  };
  events: Array<{ ts: string; type: string; meta?: any }>;
  derived: { estimatedServers: number|null; iconImpact6h: number|null };
};

export async function fetchExperience(apiBase: string, id: number): Promise<ExperienceView> {
  const r = await fetch(`${apiBase}/api/v1/experiences/${id}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function fetchHistory(apiBase: string, id: number, metric='playing', window='7d') {
  const r = await fetch(`${apiBase}/api/v1/experiences/${id}/history?metric=${metric}&window=${window}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<{ series: TimePoint[] }>;
}

export type RadarItem = { universeId: number; name: string|null; dz: number|null; accel: number|null; sustain: number|null; wilson: number|null; };

export async function fetchBreakouts(apiBase: string, limit=50) {
  const r = await fetch(`${apiBase}/api/v1/radar/breakouts?limit=${limit}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<{ items: RadarItem[] }>;
}
