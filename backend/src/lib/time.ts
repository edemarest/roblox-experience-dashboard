export const nowIso = () => new Date().toISOString();
export const hoursAgoIso = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
export const minutesAgoIso = (m: number) => new Date(Date.now() - m * 60_000).toISOString();