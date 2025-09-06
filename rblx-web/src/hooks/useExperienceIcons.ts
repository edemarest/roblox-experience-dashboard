import { getExperienceIcons } from '../lib/api';
import { useQuery } from '@tanstack/react-query';

export default function useExperienceIcons(universeId?: number){
  return useQuery({
    queryKey: ['experience','icons',universeId],
    queryFn: () => getExperienceIcons(universeId as number),
    enabled: Boolean(universeId),
  });
}
