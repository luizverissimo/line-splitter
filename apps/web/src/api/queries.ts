import { useQuery } from '@tanstack/react-query';
import { call } from './client';

export const queryKeys = {
  appInfo: ['app', 'info'] as const,
};

export function useAppInfo() {
  return useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: () => call('app:info', undefined),
    staleTime: Infinity,
  });
}
