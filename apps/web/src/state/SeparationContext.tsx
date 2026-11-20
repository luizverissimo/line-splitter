import type { SeparationProgress, SeparationResult, Stem } from '@line-splitter/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { call } from '../api/client';
import { subscribe } from '../api/events';

export interface SeparationState {
  running: boolean;
  cancelling: boolean;
  stem: Stem | null;
  progress: SeparationProgress | null;
  /** Momento (ms) em que a separação começou, para o tempo decorrido. */
  startedAt: number | null;
  error: unknown;
  /** Falha ao pedir o cancelamento (a separação continua rodando). */
  cancelError: unknown;
  result: SeparationResult | null;
  start: (stem: Stem) => void;
  cancel: () => void;
  /** Limpa resultado/erro (ex.: "Separar outro instrumento", "Novo arquivo"). */
  reset: () => void;
}

const Ctx = createContext<SeparationState | null>(null);

/** Estado da separação acima das rotas: navegar pelo app durante o processamento não perde o progresso. */
export function SeparationProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [stem, setStem] = useState<Stem | null>(null);
  const [progress, setProgress] = useState<SeparationProgress | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [cancelError, setCancelError] = useState<unknown>(null);
  const [result, setResult] = useState<SeparationResult | null>(null);
  const runId = useRef(0);
  const active = useRef(false);

  useEffect(() => {
    if (!window.api) return undefined;
    // Eventos atrasados de uma execução já encerrada não voltam a preencher a barra.
    return subscribe('separation:progress', (p) => {
      if (active.current) setProgress(p);
    });
  }, []);

  const start = useCallback(
    (selected: Stem) => {
      const id = (runId.current += 1);
      active.current = true;
      setRunning(true);
      setCancelError(null);
      setCancelling(false);
      setStem(selected);
      setProgress(null);
      setStartedAt(Date.now());
      setError(null);
      setResult(null);
      call('separation:start', { stem: selected })
        .then((r) => {
          if (runId.current === id) setResult(r);
        })
        .catch((err: unknown) => {
          if (runId.current === id) setError(err);
        })
        .finally(() => {
          if (runId.current !== id) return;
          active.current = false;
          setRunning(false);
          setCancelling(false);
          void queryClient.invalidateQueries({ queryKey: ['history'] });
        });
    },
    [queryClient],
  );

  const cancel = useCallback(() => {
    setCancelling(true);
    setCancelError(null);
    call('separation:cancel', undefined).catch((err: unknown) => {
      setCancelling(false);
      setCancelError(err);
    });
  }, []);

  const reset = useCallback(() => {
    active.current = false;
    setCancelError(null);
    setStem(null);
    setProgress(null);
    setStartedAt(null);
    setError(null);
    setResult(null);
  }, []);

  const value = useMemo(
    () => ({
      running,
      cancelling,
      stem,
      progress,
      startedAt,
      error,
      cancelError,
      result,
      start,
      cancel,
      reset,
    }),
    [running, cancelling, stem, progress, startedAt, error, cancelError, result, start, cancel, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSeparation(): SeparationState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useSeparation precisa estar dentro de SeparationProvider');
  return value;
}
