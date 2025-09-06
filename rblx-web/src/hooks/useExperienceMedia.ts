import { useQuery } from '@tanstack/react-query';
import { getExperienceMedia } from '../lib/api';

export default function useExperienceMedia(universeId?: number){
  return useQuery({
    queryKey: ['experience','media',universeId],
    queryFn: () => getExperienceMedia(universeId as number),
    enabled: !!universeId,
  });
}
