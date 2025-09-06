import { useInfiniteQuery } from '@tanstack/react-query';
import { getUniversesPage } from '../lib/api';
import type { UniverseShort } from '../lib/api';

type UniversesPage = { items: UniverseShort[]; cursor: string | null };

export function useUniverses(order = 'players') {
  return useInfiniteQuery({
    queryKey: ['universes', order],
    queryFn: ({ pageParam }: { pageParam?: string }) => getUniversesPage(order, pageParam),
    getNextPageParam: (last: UniversesPage) => last.cursor ?? undefined,
  });
}
