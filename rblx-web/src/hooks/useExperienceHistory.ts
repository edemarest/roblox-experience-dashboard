import { useQuery } from '@tanstack/react-query';
import { getExperienceHistory } from '../lib/api';

export default function useExperienceHistory(universeId?: number, metric='playing', window='24h'){
  return useQuery({
    queryKey: ['experience','history',universeId, metric, window],
    queryFn: () => getExperienceHistory(universeId as number, metric, window),
    enabled: !!universeId,
  });
}
