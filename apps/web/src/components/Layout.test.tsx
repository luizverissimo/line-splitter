import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { bridgeWith, renderApp } from '../test/render';

const info = { name: 'Line Splitter', version: '0.1.0', platform: 'linux', electron: '38.1.0' };

describe('Layout', () => {
  it('mostra a navegação em português e troca de rota', async () => {
    const user = userEvent.setup();
    renderApp('/', bridgeWith({ 'app:info': () => ({ ok: true, data: info }) }));
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' });
    for (const label of ['Início', 'Motor', 'Histórico', 'Configurações']) {
      expect(nav).toHaveTextContent(label);
    }
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Início');

    await user.click(screen.getByRole('link', { name: 'Histórico' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/historico$/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Histórico');
    expect(screen.getByRole('link', { name: 'Histórico' })).toHaveClass('active');

    await user.click(screen.getByRole('link', { name: 'Configurações' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Configurações');
    await user.click(screen.getByRole('link', { name: 'Motor' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Motor de separação');
  });

  it('mostra carregando e depois as informações do app vindas do IPC no rodapé', async () => {
    renderApp('/', bridgeWith({ 'app:info': () => ({ ok: true, data: info }) }));
    expect(screen.getByText(/Carregando informações do aplicativo/)).toBeInTheDocument();
    expect(await screen.findByText('Line Splitter 0.1.0 · Linux · Electron 38.1.0')).toBeInTheDocument();
  });

  it('mostra erro no rodapé quando a ponte não existe e tenta de novo', async () => {
    const user = userEvent.setup();
    renderApp('/');
    expect(await screen.findByText(/Ponte com o aplicativo indisponível/)).toBeInTheDocument();

    window.api = bridgeWith({ 'app:info': () => ({ ok: true, data: info }) });
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.getByText(/Line Splitter 0\.1\.0/)).toBeInTheDocument());
  });

  it('acusa resposta fora do contrato vinda do main', async () => {
    renderApp('/', bridgeWith({ 'app:info': () => ({ ok: true, data: { name: 'x' } }) }));
    expect(await screen.findByText('Resposta inválida do canal app:info.')).toBeInTheDocument();
  });

  it('mostra página não encontrada para rota desconhecida', async () => {
    const user = userEvent.setup();
    renderApp('/nao-existe', bridgeWith({ 'app:info': () => ({ ok: true, data: info }) }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Página não encontrada');
    await user.click(screen.getByRole('link', { name: 'Voltar ao início' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
