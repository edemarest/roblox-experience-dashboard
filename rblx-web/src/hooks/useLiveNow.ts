import { useQuery } from '@tanstack/react-query';
import { getLiveNow } from '../lib/api';

export function useLiveNow(limit = 12) {
  return useQuery({
    queryKey: ['liveNow', limit],
    queryFn: () => getLiveNow(limit),
    staleTime: 1000 * 30,
  });
}
