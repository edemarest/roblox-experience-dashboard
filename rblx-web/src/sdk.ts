// src/sdk.ts
export type TimePoint = [string, number | null];

export type ExperienceView = {
  universeId: number;
  header: {
    universeId: number;
    name: string | null;
    creator: { id: number | null; type: 'USER' | 'GROUP' | null; name: string | null };
    serverSize: number | null;
  };
  snapshot: {
    asOf: string;
    playing: number | null;
    visitsTotal: number | null;
    favoritesTotal: number | null;
    votes: { up: number | null; down: number | null };
    likeRatio: number | null;
    wilsonScore: number | null;
  };
  sparklines: {
    playing24h: TimePoint[];
    playing7d: TimePoint[];
    favorites24h: TimePoint[];
  };
  events: Array<{ ts: string; type: string; meta?: any }>;
  derived: { estimatedServers: number | null; iconImpact6h: number | null };
};

const API = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

export async function fetchExperience(id: number): Promise<ExperienceView> {
  const r = await fetch(`${API}/api/v1/experiences/${id}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function fetchBreakouts(limit = 10) {
  const r = await fetch(`${API}/api/v1/radar/breakouts?limit=${limit}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<{ items: Array<{ universeId: number; name: string | null; dz: number | null; sustain: number | null; wilson: number | null }> }>;
}
