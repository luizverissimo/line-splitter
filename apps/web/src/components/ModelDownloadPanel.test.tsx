import type { EngineStatus } from '@line-splitter/shared';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { eventBridge, renderApp } from '../test/render';
import { testModels } from '../test/engine';

const info = { name: 'Line Splitter', version: '0.1.0', platform: 'linux', electron: '45.4.1' };
const base: EngineStatus = {
  python: { ok: true, detail: 'Python 3.12.3', path: '/usr/bin/python3' },
  ffmpeg: {
    ok: true,
    detail: 'FFmpeg 6.1.1 · ffprobe 6.1.1',
    path: '/usr/bin/ffmpeg',
    ffprobePath: '/usr/bin/ffprobe',
  },
  separator: { ok: true, detail: 'Demucs 4.1.0 · PyTorch 2.6.0+cu124' },
  model: { ok: false, detail: 'Falta baixar: MelBand-RoFormer Kim FT2 Bleedless, BS-Roformer-SW (1,5 GB).' },
  models: testModels(false),
  device: { preference: 'auto', effective: 'cuda', cudaAvailable: true, gpuName: 'RTX 3050', warning: null },
  engineDir: '/dados/engine',
  ready: false,
};
const total = 54_996_327;

function deferred() {
  let resolve: (v: unknown) => void = () => undefined;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Download do modelo', () => {
  it('mostra progresso real em bytes e, ao terminar, o modelo fica ✔', async () => {
    const user = userEvent.setup();
    let status = base;
    const pending = deferred();
    const download = vi.fn(() => pending.promise);
    const { bridge, emit } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({ ok: true, data: status }),
      'engine:downloadModel': download,
    });
    renderApp('/motor', bridge);
    expect(
      await screen.findByText(
        /Baixa os modelos MelBand-RoFormer Kim FT2 Bleedless, BS-Roformer-SW \(\s*1,5 GB no total\)/,
      ),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Baixar modelos' }));
    expect(download).toHaveBeenCalledOnce();
    expect(screen.getByText('Conectando…')).toBeInTheDocument();
    act(() =>
      emit('engine:modelProgress', { receivedBytes: 27_498_163, totalBytes: total, model: 'BS-Roformer-SW' }),
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    expect(screen.getByText('Baixando BS-Roformer-SW: 26,2 MB de 52,4 MB')).toBeInTheDocument();

    status = {
      ...base,
      model: { ok: true, detail: '2 modelos baixados.' },
      models: testModels(true),
      ready: true,
    };
    await act(async () => {
      pending.resolve({
        ok: true,
        data: { sizeBytes: total, models: ['MelBand-RoFormer Kim FT2 Bleedless', 'BS-Roformer-SW'] },
      });
    });
    expect(await screen.findByText('Modelos baixados e conferidos (52,4 MB).')).toBeInTheDocument();
    expect(await screen.findByText('Tudo pronto para separar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baixar modelos' })).not.toBeInTheDocument();
  });

  it('checksum inválido mostra erro com "Tentar de novo"', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { bridge } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({ ok: true, data: base }),
      'engine:downloadModel': () => {
        attempts += 1;
        return {
          ok: false,
          error: {
            code: 'ENGINE_FAILED',
            message: 'O arquivo do modelo está corrompido (checksum diferente do esperado). Tente de novo.',
            details: 'SHA-256 ffff…; esperado começar com 34c22ccb.',
          },
        };
      },
    });
    renderApp('/motor', bridge);
    await user.click(await screen.findByRole('button', { name: 'Baixar modelos' }));
    expect(await screen.findByText('O download dos modelos falhou')).toBeInTheDocument();
    expect(screen.getByText(/checksum diferente do esperado/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(attempts).toBe(2);
  });

  it('cancelar pede ao main e mostra o aviso', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const cancel = vi.fn(() => {
      pending.resolve({
        ok: false,
        error: {
          code: 'CANCELLED',
          message: 'Download dos modelos cancelado. O que já foi baixado é aproveitado na próxima vez.',
        },
      });
      return { ok: true, data: { cancelled: true } };
    });
    const { bridge } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({ ok: true, data: base }),
      'engine:downloadModel': () => pending.promise,
      'engine:cancelDownload': cancel,
    });
    renderApp('/motor', bridge);
    await user.click(await screen.findByRole('button', { name: 'Baixar modelos' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar download' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(
        'Download dos modelos cancelado. O que já foi baixado é aproveitado na próxima vez.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baixar modelos' })).toBeEnabled();
  });

  it('modelo já baixado não mostra o painel', async () => {
    const { bridge } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({
        ok: true,
        data: {
          ...base,
          model: { ok: true, detail: '2 modelos baixados.' },
          models: testModels(true),
          ready: true,
        },
      }),
    });
    renderApp('/motor', bridge);
    expect(await screen.findByText('Tudo pronto para separar.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Modelos de separação' })).not.toBeInTheDocument();
  });
});
