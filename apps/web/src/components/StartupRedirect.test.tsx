import { act, fireEvent, render, screen } from '@testing-library/react';
import { HashRouter } from 'react-router';
import type { EngineStatus } from '@line-splitter/shared';
import { notifyManager } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { App, AppRoutes } from '../App';
import { createQueryClient } from '../api/queryClient';
import { queryKeys } from '../api/queries';
import { bridgeWith } from '../test/render';
import { testModels } from '../test/engine';

const notReady: EngineStatus = {
  ready: false,
  python: { ok: true, detail: 'Python 3.12.3', path: '/usr/bin/python3' },
  ffmpeg: { ok: true, detail: 'FFmpeg 6.1', path: '/usr/bin/ffmpeg', ffprobePath: '/usr/bin/ffprobe' },
  separator: { ok: false, detail: 'Motor não instalado.' },
  model: { ok: false, detail: 'Pesos não baixados.' },
  models: testModels(false),
  device: { preference: 'auto', effective: 'cpu', cudaAvailable: false, gpuName: null, warning: null },
  engineDir: '/dados/engine',
};

function deferred<T>() {
  let resolve: (v: T) => void = () => undefined;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderWithHashRouter(status: Promise<unknown>, queryClient = createQueryClient()) {
  window.location.hash = '#/';
  window.api = bridgeWith({ 'engine:status': () => status });
  return render(
    <App queryClient={queryClient}>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </App>,
  );
}

describe('StartupRedirect (HashRouter, como no app)', () => {
  it('sem ninguém mexer, motor não pronto leva à tela Motor', async () => {
    const status = deferred<unknown>();
    renderWithHashRouter(status.promise);
    await act(async () => status.resolve({ ok: true, data: notReady }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Motor de separação' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/motor');
  });

  it('se o usuário clicou em Início antes da resposta do motor, fica no Início', async () => {
    const queryClient = createQueryClient();
    renderWithHashRouter(new Promise(() => undefined), queryClient);
    // Clique e resposta do motor no mesmo lote: o React Router aplica a navegação numa transição
    // (prioridade baixa) e a resposta do motor é renderizada antes dela — a mesma corrida vista no app.
    notifyManager.setScheduler((cb) => cb());
    try {
      act(() => {
        fireEvent.click(screen.getByRole('link', { name: 'Início' }));
        queryClient.setQueryData(queryKeys.engineStatus, notReady);
      });
    } finally {
      notifyManager.setScheduler((cb) => setTimeout(cb, 0));
    }
    await act(async () => new Promise((r) => setTimeout(r, 50)));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Início');
    expect(window.location.hash).toBe('#/');
  });
});
