import { useQuery } from '@tanstack/react-query';
import { getExperience } from '../lib/api';
export default function useExperience(universeId?: number) {
  return useQuery({
    queryKey: ['experience', universeId],
    queryFn: () => getExperience(universeId as number),
    enabled: !!universeId,
  });
}
