// Simple smoke test for virtualization slice calculation
// Mirrors logic in src/pages/Universes.tsx

function computeWindow(scrollTop, containerHeight, itemHeight, overscan, totalCount) {
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(totalCount, Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan);
  return { startIndex, endIndex };
}

const tests = [
  { scrollTop: 0, containerHeight: 600, itemHeight: 80, overscan: 6, totalCount: 100 },
  { scrollTop: 400, containerHeight: 600, itemHeight: 80, overscan: 6, totalCount: 100 },
  { scrollTop: 4000, containerHeight: 600, itemHeight: 80, overscan: 6, totalCount: 100 },
  { scrollTop: 7600, containerHeight: 600, itemHeight: 80, overscan: 6, totalCount: 100 },
];

for (const t of tests) {
  const out = computeWindow(t.scrollTop, t.containerHeight, t.itemHeight, t.overscan, t.totalCount);
  console.log(`scrollTop=${t.scrollTop} => start=${out.startIndex}, end=${out.endIndex}`);
}
