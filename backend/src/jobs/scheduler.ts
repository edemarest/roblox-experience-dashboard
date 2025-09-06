import cron from 'node-cron';
import { runHourlySnapshot } from './hourly-snapshot.js';
import { runLiveCache } from './live-cache.js';
import { runDailyMetadata } from './daily-metadata.js';
import { log, error } from '../lib/logger.js';
import { runAutoDiscovery } from './auto-discovery.js';
import '../lib/db.js';

async function wrap(task: () => Promise<void>, name: string) {
try { await task(); log(`${name} ok`); } catch (e) { error(`${name} failed`, e); }
}

// Every 10 minutes
cron.schedule('*/10 * * * *', () => wrap(runLiveCache, 'live-cache'));

// Hourly at minute 0
cron.schedule('0 * * * *', () => wrap(runHourlySnapshot, 'hourly-snapshot'));

// Daily at 03:10
cron.schedule('10 3 * * *', () => wrap(runDailyMetadata, 'daily-metadata'));

cron.schedule('5 * * * *', () => runAutoDiscovery(250).catch(console.warn));

log('Job scheduler started');