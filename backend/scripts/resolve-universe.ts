import { resolveUniverseIdFromPlace } from '../src/fetchers/roblox.js';

const placeId = Number(process.argv[2]);
if (!placeId) {
  console.error('Usage: tsx scripts/resolve-universe.ts 99567941238278');
  process.exit(1);
}

const id = await resolveUniverseIdFromPlace(placeId);
console.log(JSON.stringify({ placeId, universeId: id }, null, 2));
