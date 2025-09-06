import { useInfiniteQuery } from '@tanstack/react-query';
import { getExperienceBadges } from '../lib/api';

export default function useExperienceBadges(universeId?: number){
  return useInfiniteQuery({
    queryKey: ['experience','badges',universeId],
    queryFn: ({ pageParam }: { pageParam?: number }) => getExperienceBadges(universeId as number, pageParam),
    enabled: !!universeId,
  getNextPageParam: (last: { nextCursor: number | null }) => last.nextCursor ?? undefined,
  });
}
