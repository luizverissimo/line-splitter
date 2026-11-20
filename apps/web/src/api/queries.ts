import type { SettingsUpdate } from '@line-splitter/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { call } from './client';

export const queryKeys = {
  appInfo: ['app', 'info'] as const,
  settings: ['settings'] as const,
  engineStatus: ['engine', 'status'] as const,
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
    onSuccess: (settings) => {
      queryClient.setQueryData(queryKeys.settings, settings);
      void queryClient.invalidateQueries({ queryKey: queryKeys.engineStatus });
    },
  });
}

export function useEngineStatus() {
  return useQuery({
    queryKey: queryKeys.engineStatus,
    queryFn: () => call('engine:status', undefined),
    staleTime: 30_000,
  });
}
