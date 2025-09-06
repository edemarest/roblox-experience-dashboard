import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resolveAndTrack } from '../lib/api';
import type { UniverseShort } from '../lib/api';

export default function useTrackUniverse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string) => {
      const res = await resolveAndTrack(input);
      if (!res) throw new Error('failed to resolve');
      return res.universe_id;
    },
    // optimistic update: prepend a placeholder universe to the cached first page
    onMutate: async (input: string) => {
      await qc.cancelQueries(['universes']);
      const previous = qc.getQueryData(['universes']);
      // create a temp placeholder
      const placeholder: UniverseShort = {
        universe_id: Math.floor(Math.random() * 1000000000),
        name: `Resolving ${input}`,
        icon_url: null,
        players_now: 0,
        favorites: 0,
        last_seen_at: null,
      };
      qc.setQueryData(['universes'], (old: any) => {
        if (!old) return old;
        const firstPage = old.pages?.[0];
        const newFirst = firstPage ? { ...firstPage, items: [placeholder, ...firstPage.items] } : { items: [placeholder], cursor: null };
        return { ...old, pages: [newFirst, ...(old.pages?.slice(1) ?? [])] };
      });
      return { previous };
    },
    onError: (_err: unknown, _input: string, context: { previous?: unknown } | undefined) => {
      qc.setQueryData(['universes'], context?.previous as any);
    },
    onSettled: () => {
      qc.invalidateQueries(['universes']);
    }
  });
}
