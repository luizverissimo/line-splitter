import type { ModelDownloadResult, ModelProgress } from '@line-splitter/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { call } from '../api/client';
import { subscribe } from '../api/events';
import { queryKeys } from '../api/queries';

export interface ModelDownloadState {
  running: boolean;
  cancelling: boolean;
  progress: ModelProgress | null;
  error: unknown;
  result: ModelDownloadResult | null;
  start: () => void;
  cancel: () => void;
}

const Ctx = createContext<ModelDownloadState | null>(null);

/** Estado do download do modelo, acima das rotas (trocar de tela não perde o progresso). */
export function ModelDownloadProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState<ModelProgress | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<ModelDownloadResult | null>(null);

  useEffect(() => {
    if (!window.api) return undefined;
    return subscribe('engine:modelProgress', setProgress);
  }, []);

  const start = useCallback(() => {
    setRunning(true);
    setCancelling(false);
    setProgress(null);
    setError(null);
    setResult(null);
    call('engine:downloadModel', undefined)
      .then(setResult)
      .catch(setError)
      .finally(() => {
        setRunning(false);
        setCancelling(false);
        void queryClient.invalidateQueries({ queryKey: queryKeys.engineStatus });
      });
  }, [queryClient]);

  const cancel = useCallback(() => {
    setCancelling(true);
    call('engine:cancelDownload', undefined).catch((err: unknown) => {
      setCancelling(false);
      setError(err);
    });
  }, []);

  const value = useMemo(
    () => ({ running, cancelling, progress, error, result, start, cancel }),
    [running, cancelling, progress, error, result, start, cancel],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useModelDownload(): ModelDownloadState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useModelDownload precisa estar dentro de ModelDownloadProvider');
  return value;
}
