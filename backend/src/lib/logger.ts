export const nowIso = () => new Date().toISOString();
/* super simple logger */
export const log = (...args: any[]) => console.log('[app]', ...args);
export const warn = (...args: any[]) => console.warn('[app]', ...args);
export const error = (...args: any[]) => console.error('[app]', ...args);