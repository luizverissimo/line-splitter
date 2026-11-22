import type { AudioInfo } from '@line-splitter/shared';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventBridge, renderApp } from '../test/render';
import { testModels } from '../test/engine';

const info = { name: 'Line Splitter', version: '0.1.0', platform: 'linux', electron: '45.4.1' };
const audio: AudioInfo = {
  path: '/m/a.wav',
  fileName: 'a.wav',
  name: 'a',
  extension: 'wav',
  sizeBytes: 1000,
  durationS: 10,
  container: 'wav',
  codec: 'pcm_s16le',
  sampleRate: 44100,
  channels: 2,
  mediaUrl: 'media://audio/x',
};
const ready = {
  python: { ok: true, detail: 'x', path: '/p' },
  ffmpeg: { ok: true, detail: 'x', path: '/f', ffprobePath: '/fp' },
  separator: { ok: true, detail: 'Demucs' },
  model: { ok: true, detail: 'Modelo' },
  models: testModels(true),
  device: { preference: 'auto', effective: 'cpu', cudaAvailable: false, gpuName: null, warning: null },
  engineDir: '/d',
  ready: true,
};

async function startSeparation(handlers: Record<string, (p: unknown) => unknown>, fakeTimers = false) {
  const user = fakeTimers
    ? userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
    : userEvent.setup();
  const { bridge, emit } = eventBridge({
    'app:info': () => ({ ok: true, data: info }),
    'engine:status': () => ({ ok: true, data: ready }),
    'dialog:chooseFile': () => ({ ok: true, data: audio.path }),
    'audio:inspect': () => ({ ok: true, data: audio }),
    ...handlers,
  });
  renderApp('/', bridge);
  await user.click(screen.getByRole('button', { name: 'Escolher arquivo' }));
  await user.click(await screen.findByRole('radio', { name: /Voz/ }));
  await user.click(await screen.findByRole('button', { name: 'Separar' }));
  return { user, emit };
}

afterEach(() => vi.useRealTimers());

describe('Tela de processamento', () => {
  it('mostra o progresso real recebido por evento e o tempo decorrido', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { emit } = await startSeparation({ 'separation:start': () => new Promise(() => undefined) }, true);
    expect(screen.getByRole('heading', { name: 'Separando: Voz' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
    act(() => emit('separation:progress', { phase: 'separating', percent: 42.5 }));
    expect(screen.getByRole('progressbar', { name: 'Separando o instrumento' })).toHaveAttribute(
      'aria-valuenow',
      '43',
    );
    act(() => emit('separation:progress', { phase: 'encoding', percent: 90 }));
    expect(screen.getByRole('progressbar', { name: 'Gerando os MP3' })).toHaveAttribute(
      'aria-valuenow',
      '90',
    );
    const elapsed = () => screen.getByText(/Tempo decorrido:/).textContent;
    const start = elapsed();
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(elapsed()).toBe(start);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const one = elapsed();
    expect(one).not.toBe(start);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(elapsed()).not.toBe(one);
  });

  it('Cancelar mostra o andamento até terminar e volta à escolha do instrumento', async () => {
    let finish: (v: unknown) => void = () => undefined;
    const cancel = vi.fn(() => {
      setTimeout(
        () =>
          finish({
            ok: false,
            error: { code: 'CANCELLED', message: 'Separação cancelada. Nenhum arquivo foi gerado.' },
          }),
        10,
      );
      return { ok: true, data: { cancelled: true } };
    });
    const { user } = await startSeparation({
      'separation:start': () =>
        new Promise((r) => {
          finish = r;
        }),
      'separation:cancel': cancel,
    });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(await screen.findByText('Separação cancelada. Nenhum arquivo foi gerado.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Escolher instrumento' }));
    expect(screen.getByRole('group', { name: 'Qual instrumento você quer separar?' })).toBeInTheDocument();
  });

  it('enquanto o cancelamento não termina, o botão mostra andamento e não repete o pedido', async () => {
    let finish: (v: unknown) => void = () => undefined;
    const cancel = vi.fn(() => ({ ok: true, data: { cancelled: true } }));
    const { user } = await startSeparation({
      'separation:start': () =>
        new Promise((r) => {
          finish = r;
        }),
      'separation:cancel': cancel,
    });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    const button = screen.getByRole('button', { name: 'Cancelar' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(cancel).toHaveBeenCalledOnce();
    act(() =>
      finish({
        ok: false,
        error: { code: 'CANCELLED', message: 'Separação cancelada. Nenhum arquivo foi gerado.' },
      }),
    );
    expect(await screen.findByText('Separação cancelada. Nenhum arquivo foi gerado.')).toBeInTheDocument();
  });

  it('falha ao cancelar aparece no painel e permite tentar de novo', async () => {
    let calls = 0;
    const { user } = await startSeparation({
      'separation:start': () => new Promise(() => undefined),
      'separation:cancel': () => {
        calls += 1;
        return calls === 1
          ? { ok: false, error: { code: 'INTERNAL', message: 'O processo não respondeu.' } }
          : { ok: true, data: { cancelled: true } };
      },
    });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByText('Não foi possível cancelar')).toBeInTheDocument();
    expect(screen.getByText(/O processo não respondeu\. A separação continua/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Separando: Voz' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(calls).toBe(2);
    expect(screen.queryByText('Não foi possível cancelar')).not.toBeInTheDocument();
  });

  it('erro mostra mensagem legível, log técnico expansível e copiar', async () => {
    const { user } = await startSeparation({
      'separation:start': () => ({
        ok: false,
        error: {
          code: 'ENGINE_FAILED',
          message:
            'Memória da GPU insuficiente para esta música. Escolha "CPU" em Configurações e tente de novo.',
          details: 'torch.OutOfMemoryError: CUDA out of memory',
        },
      }),
    });
    expect(await screen.findByText('A separação falhou')).toBeInTheDocument();
    expect(screen.getByText(/Memória da GPU insuficiente/)).toBeInTheDocument();
    expect(screen.getByText('Ver log técnico')).toBeInTheDocument();
    expect(screen.getByText('torch.OutOfMemoryError: CUDA out of memory')).toBeInTheDocument();
    // O user-event instala a própria área de transferência no setup; a espiã vem depois dele.
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(screen.getByRole('button', { name: 'Copiar log' }));
    expect(writeText).toHaveBeenCalledWith('torch.OutOfMemoryError: CUDA out of memory');
    expect(await screen.findByText('Log copiado.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByRole('button', { name: 'Separar' })).toBeInTheDocument();
  });
});
