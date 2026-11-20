import type { InstallResult, InstallStep } from '@line-splitter/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { call } from '../api/client';
import { subscribe } from '../api/events';
import { queryKeys } from '../api/queries';

const MAX_LINES = 500;

export interface EngineInstallState {
  running: boolean;
  cancelling: boolean;
  step: InstallStep | null;
  log: string[];
  error: unknown;
  result: InstallResult | null;
  start: (reinstall: boolean) => void;
  cancel: () => void;
}

const Ctx = createContext<EngineInstallState | null>(null);

/**
 * Estado da instalação do motor, acima das rotas: navegar para outra tela não perde o progresso nem o log.
 */
export function EngineInstallProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [step, setStep] = useState<InstallStep | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<InstallResult | null>(null);

  useEffect(() => {
    if (!window.api) return undefined;
    const offStep = subscribe('engine:installStep', setStep);
    const offLog = subscribe('engine:installLog', ({ line }) =>
      setLog((lines) => (lines.length >= MAX_LINES ? [...lines.slice(1), line] : [...lines, line])),
    );
    return () => {
      offStep();
      offLog();
    };
  }, []);

  const start = useCallback(
    (reinstall: boolean) => {
      setRunning(true);
      setCancelling(false);
      setStep(null);
      setLog([]);
      setError(null);
      setResult(null);
      call('engine:install', { reinstall })
        .then(setResult)
        .catch(setError)
        .finally(() => {
          setRunning(false);
          setCancelling(false);
          void queryClient.invalidateQueries({ queryKey: queryKeys.engineStatus });
        });
    },
    [queryClient],
  );

  const cancel = useCallback(() => {
    setCancelling(true);
    call('engine:cancelInstall', undefined).catch((err: unknown) => {
      setCancelling(false);
      setError(err);
    });
  }, []);

  const value = useMemo(
    () => ({ running, cancelling, step, log, error, result, start, cancel }),
    [running, cancelling, step, log, error, result, start, cancel],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEngineInstall(): EngineInstallState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useEngineInstall precisa estar dentro de EngineInstallProvider');
  return value;
}
