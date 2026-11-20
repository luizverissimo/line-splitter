import type { SettingsUpdate } from '@line-splitter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { call } from './client';

export const queryKeys = {
  appInfo: ['app', 'info'] as const,
  settings: ['settings'] as const,
};

export function useAppInfo() {
  return useQuery({
    queryKey: queryKeys.appInfo,
    queryFn: () => call('app:info', undefined),
    staleTime: Infinity,
  });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => call('settings:get', undefined) });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsUpdate) => call('settings:update', patch),
    onSuccess: (settings) => queryClient.setQueryData(queryKeys.settings, settings),
  });
}
