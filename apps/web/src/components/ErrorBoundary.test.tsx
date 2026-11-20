import { render, screen } from '@testing-library/react';
import { HashRouter, MemoryRouter, Route, Routes } from 'react-router';
import { App } from '../App';
import { createQueryClient } from '../api/queryClient';
import { HomePage } from '../pages/HomePage';
import { bridgeWith } from '../test/render';
import { Layout } from './Layout';
import userEvent from '@testing-library/user-event';
import { AppError } from '@line-splitter/shared';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

let shouldThrow = true;
function Explode() {
  if (shouldThrow) throw new AppError('IO', 'Falha ao ler o arquivo.', 'EACCES: /musica.mp3');
  return <p>Tela recuperada</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('mostra a mensagem do erro e os detalhes técnicos', () => {
    render(
      <ErrorBoundary>
        <Explode />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Algo deu errado nesta tela');
    expect(screen.getByText('Falha ao ler o arquivo.')).toBeInTheDocument();
    expect(screen.getByText('EACCES: /musica.mp3')).toBeInTheDocument();
  });

  it('recupera a tela ao clicar em "Tentar de novo"', async () => {
    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <Explode />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByText('Tela recuperada')).toBeInTheDocument();
  });

  it('não interfere quando não há erro', () => {
    function Ok() {
      const [n] = useState(1);
      return <p>Conteúdo {n}</p>;
    }
    render(
      <ErrorBoundary>
        <Ok />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Conteúdo 1')).toBeInTheDocument();
  });

  it('o App envolve tudo com o boundary global', () => {
    render(
      <App queryClient={createQueryClient()}>
        <Explode />
      </App>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao ler o arquivo.');
  });

  it('erro numa página mantém a navegação e sai ao trocar de rota', async () => {
    const user = userEvent.setup();
    window.api = bridgeWith({
      'app:info': () => ({
        ok: true,
        data: { name: 'Line Splitter', version: '0.1.0', platform: 'linux', electron: '38.1.0' },
      }),
    });
    render(
      <App queryClient={createQueryClient()}>
        <MemoryRouter initialEntries={['/quebrada']}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="quebrada" element={<Explode />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </App>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao ler o arquivo.');
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Início' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Início');
  });

  it('"Voltar ao início" leva à rota inicial', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/motor';
    render(
      <ErrorBoundary>
        <Explode />
      </ErrorBoundary>,
    );
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: 'Voltar ao início' }));
    expect(window.location.hash).toBe('#/');
    expect(screen.getByText('Tela recuperada')).toBeInTheDocument();
  });

  it('"Voltar ao início" sai de uma página que sempre quebra (HashRouter real)', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/quebrada';
    window.api = bridgeWith({
      'app:info': () => ({
        ok: true,
        data: { name: 'Line Splitter', version: '0.1.0', platform: 'linux', electron: '38.1.0' },
      }),
    });
    render(
      <App queryClient={createQueryClient()}>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="quebrada" element={<Explode />} />
            </Route>
          </Routes>
        </HashRouter>
      </App>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Falha ao ler o arquivo.');
    await user.click(screen.getByRole('button', { name: 'Voltar ao início' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Início' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(shouldThrow).toBe(true);
  });
});
