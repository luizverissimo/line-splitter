import type { Settings } from '@line-splitter/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { bridgeWith, renderApp } from '../test/render';

const info = { name: 'Line Splitter', version: '0.1.0', platform: 'linux', electron: '45.4.1' };
const stored: Settings = {
  outputDir: '/home/u/Música/Line Splitter',
  bitrateKbps: 320,
  device: 'auto',
  pythonPath: '',
  ffmpegPath: '',
};

function setup(overrides: Record<string, (payload: unknown) => unknown> = {}) {
  let current = { ...stored };
  const update = vi.fn((patch: unknown) => {
    current = { ...current, ...(patch as Partial<Settings>) };
    return { ok: true, data: current };
  });
  const bridge = bridgeWith({
    'app:info': () => ({ ok: true, data: info }),
    'settings:get': () => ({ ok: true, data: current }),
    'settings:update': update,
    ...overrides,
  });
  renderApp('/configuracoes', bridge);
  return { update };
}

describe('Tela Configurações', () => {
  it('carrega as configurações salvas', async () => {
    setup();
    expect(screen.getByText('Carregando configurações…')).toBeInTheDocument();
    expect(await screen.findByLabelText('Pasta de saída')).toHaveValue('/home/u/Música/Line Splitter');
    expect(screen.getByLabelText('Qualidade do MP3')).toHaveValue('320');
    expect(screen.getByLabelText('Dispositivo de processamento')).toHaveValue('auto');
    expect(screen.getByLabelText('Caminho do Python')).toHaveValue('');
  });

  it('salva alterações pelo IPC e confirma', async () => {
    const user = userEvent.setup();
    const { update } = setup();
    await user.selectOptions(await screen.findByLabelText('Qualidade do MP3'), '192');
    await user.selectOptions(screen.getByLabelText('Dispositivo de processamento'), 'cpu');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument();
    expect(update).toHaveBeenCalledWith({ bitrateKbps: 192, device: 'cpu' });
  });

  it('valida no cliente antes de enviar', async () => {
    const user = userEvent.setup();
    const { update } = setup();
    const out = await screen.findByLabelText('Pasta de saída');
    await user.clear(out);
    await user.type(out, 'pasta-relativa');
    await user.type(screen.getByLabelText('Caminho do Python'), 'python3');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(await screen.findByText('A pasta de saída precisa ser um caminho absoluto.')).toBeInTheDocument();
    expect(screen.getByText('O caminho do Python precisa ser absoluto.')).toBeInTheDocument();
    expect(out).toHaveAttribute('aria-invalid', 'true');
    expect(update).not.toHaveBeenCalled();
  });

  it('mostra o erro de validação do processo principal', async () => {
    const user = userEvent.setup();
    setup({
      'settings:update': () => ({
        ok: false,
        error: { code: 'VALIDATION', message: 'Python: arquivo não encontrado.' },
      }),
    });
    await user.type(await screen.findByLabelText('Caminho do Python'), '/opt/python-inexistente');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(await screen.findByText('Python: arquivo não encontrado.')).toBeInTheDocument();
    expect(screen.queryByText('Configurações salvas.')).not.toBeInTheDocument();
  });

  it('escolhe pasta e executável pelos diálogos nativos e volta à detecção automática', async () => {
    const user = userEvent.setup();
    setup({
      'dialog:chooseDirectory': () => ({ ok: true, data: '/mnt/dados/Separações' }),
      'dialog:chooseFile': () => ({ ok: true, data: '/usr/bin/ffmpeg' }),
    });
    await screen.findByLabelText('Pasta de saída');
    const [chooseDir, , chooseFfmpeg] = screen.getAllByRole('button', { name: 'Escolher…' });
    await user.click(chooseDir as HTMLElement);
    await waitFor(() => expect(screen.getByLabelText('Pasta de saída')).toHaveValue('/mnt/dados/Separações'));
    await user.click(chooseFfmpeg as HTMLElement);
    await waitFor(() => expect(screen.getByLabelText('Caminho do FFmpeg')).toHaveValue('/usr/bin/ffmpeg'));
    const autoButtons = screen.getAllByRole('button', { name: 'Usar detecção automática' });
    await user.click(autoButtons[1] as HTMLElement);
    expect(screen.getByLabelText('Caminho do FFmpeg')).toHaveValue('');
  });

  it('cancelar o diálogo não altera o campo', async () => {
    const user = userEvent.setup();
    setup({ 'dialog:chooseDirectory': () => ({ ok: true, data: null }) });
    await screen.findByLabelText('Pasta de saída');
    await user.click(screen.getAllByRole('button', { name: 'Escolher…' })[0] as HTMLElement);
    expect(screen.getByLabelText('Pasta de saída')).toHaveValue('/home/u/Música/Line Splitter');
  });

  it('erro ao carregar oferece nova tentativa', async () => {
    const user = userEvent.setup();
    let fail = true;
    setup({
      'settings:get': () =>
        fail
          ? { ok: false, error: { code: 'INTERNAL', message: 'Banco indisponível.' } }
          : { ok: true, data: stored },
    });
    expect(await screen.findByText('Não foi possível carregar as configurações')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByLabelText('Pasta de saída')).toBeInTheDocument();
  });

  it('sem alterações não chama o IPC', async () => {
    const user = userEvent.setup();
    const { update } = setup();
    await screen.findByLabelText('Pasta de saída');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(screen.getByText('Nenhuma alteração para salvar.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('bloqueia a edição enquanto salva', async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => undefined;
    setup({
      'settings:update': (patch) =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, data: { ...stored, ...(patch as Partial<Settings>) } });
        }),
    });
    await user.selectOptions(await screen.findByLabelText('Qualidade do MP3'), '256');
    await user.click(screen.getByRole('button', { name: 'Salvar configurações' }));
    expect(screen.getByLabelText('Qualidade do MP3')).toBeDisabled();
    expect(screen.getByLabelText('Pasta de saída')).toBeDisabled();
    for (const b of screen.getAllByRole('button', { name: 'Escolher…' })) expect(b).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvar configurações' })).toHaveAttribute('aria-busy', 'true');
    release(undefined);
    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument();
    expect(screen.getByLabelText('Qualidade do MP3')).toBeEnabled();
    expect(screen.getByLabelText('Qualidade do MP3')).toHaveValue('256');
  });
});
