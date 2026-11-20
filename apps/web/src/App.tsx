import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRoutes } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { routes } from './routes';
import { EngineInstallProvider } from './state/EngineInstallContext';
import { ModelDownloadProvider } from './state/ModelDownloadContext';
import { SeparationProvider } from './state/SeparationContext';
import { HomeStateProvider } from './state/HomeStateContext';

/** Árvore de rotas; o roteador (hash no app, memória nos testes) é fornecido por quem renderiza. */
export function AppRoutes() {
  return useRoutes(routes);
}

interface Props {
  queryClient: QueryClient;
  children: ReactNode;
}

export function App({ queryClient, children }: Props) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <EngineInstallProvider>
          <ModelDownloadProvider>
            <SeparationProvider>
              <HomeStateProvider>{children}</HomeStateProvider>
            </SeparationProvider>
          </ModelDownloadProvider>
        </EngineInstallProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
