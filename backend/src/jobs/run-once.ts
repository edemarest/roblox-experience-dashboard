import { runLiveCache } from './live-cache.js';
import { runHourlySnapshot } from './hourly-snapshot.js';
import { runDailyMetadata } from './daily-metadata.js';

await runLiveCache();
await runHourlySnapshot();
await runDailyMetadata();

console.log('run-once completed');