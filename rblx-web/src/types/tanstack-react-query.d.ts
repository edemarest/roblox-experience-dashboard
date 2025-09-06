declare module '@tanstack/react-query' {
  import type { ReactNode } from 'react';
  export class QueryClient { constructor(opts?: any); }
  // v5 object-signature overloads
  export function useQuery(options: any): any;
  export function useInfiniteQuery(options: any): any;
  export function useMutation(options: any): any;
  export function useQueryClient(): any;
  export function QueryClientProvider(props: { client: QueryClient; children: ReactNode }): any;
}
