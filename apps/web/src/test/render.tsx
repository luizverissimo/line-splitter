import { render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import type { DesktopBridge } from '@line-splitter/shared';
import { App, AppRoutes } from '../App';
import { createQueryClient } from '../api/queryClient';

/** Expõe o caminho atual para os testes conferirem a navegação. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

/** Renderiza o app inteiro numa rota, com a ponte IPC fornecida pelo teste. */
export function renderApp(path: string, bridge?: DesktopBridge) {
  if (bridge) window.api = bridge;
  else delete window.api;
  const queryClient = createQueryClient();
  const result = render(
    <App queryClient={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
        <LocationProbe />
      </MemoryRouter>
    </App>,
  );
  return { ...result, queryClient };
}

/** Ponte que responde canais com handlers do próprio teste, no formato de envelope do IPC real. */
export function bridgeWith(handlers: Record<string, (payload: unknown) => unknown>): DesktopBridge {
  return {
    invoke: async (channel, payload) => {
      const handler = handlers[channel];
      if (!handler)
        return { ok: false, error: { code: 'NOT_FOUND', message: `Canal ${channel} sem handler` } };
      return handler(payload);
    },
    on: () => () => undefined,
  };
}

/** Ponte de teste que também emite eventos main → renderer, como o webContents.send faria. */
export function eventBridge(handlers: Record<string, (payload: unknown) => unknown>) {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const bridge: DesktopBridge = {
    ...bridgeWith(handlers),
    on: (event, listener) => {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return () => set.delete(listener);
    },
  };
  const emit = (event: string, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  };
  return { bridge, emit };
}
