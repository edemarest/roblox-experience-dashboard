import { useRef, useState, useCallback } from 'react';
import { useUniverses } from '../hooks/useUniverses';
import UniverseRow from '../components/UniverseRow';
import useTrackUniverse from '../hooks/useTrackUniverse';
import type { UniverseShort } from '../lib/api';
import UniverseCardSkeleton from '../components/UniverseCardSkeleton';

export default function UniversesPage() {
  const [input, setInput] = useState('');
  const q = useUniverses('players');
  const tracker = useTrackUniverse();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const ITEM_HEIGHT = 80; // px, approximate height per row
  const OVERSCAN = 6;

  async function onTrack(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!input) return;
    tracker.mutate(input);
    setInput('');
  }

  const items = q.data?.pages?.flatMap((p: { items: UniverseShort[] }) => p.items) ?? [];

  const totalCount = items.length;
  const containerHeight = 600; // px; adjust as desired or make CSS-driven

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
    const currentIndex = Math.floor((e.currentTarget.scrollTop + containerHeight) / ITEM_HEIGHT);
    if (currentIndex + 10 >= totalCount && q.hasNextPage) {
      q.fetchNextPage?.();
    }
  }, [q, totalCount]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(totalCount, Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + OVERSCAN);

  return (
    <main>
      <h1>Tracked universes</h1>
      <form onSubmit={onTrack}>
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="universe id or place URL" />
        <button>Track</button>
      </form>

      <div>
        {q.isLoading && Array.from({ length: 6 }).map((_, i) => (<UniverseCardSkeleton key={i} />))}

        <div ref={containerRef} onScroll={onScroll} style={{ height: containerHeight, overflow: 'auto' }}>
          <div style={{ height: totalCount * ITEM_HEIGHT, position: 'relative' }}>
            {items.slice(startIndex, endIndex).map((u: UniverseShort, idx: number) => {
              const top = (startIndex + idx) * ITEM_HEIGHT;
              return (
                <div key={u.universe_id} style={{ position: 'absolute', left: 0, right: 0, top }}>
                  <UniverseRow universe={u} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
