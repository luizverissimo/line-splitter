import type { EngineStatus } from '@line-splitter/shared';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { eventBridge, renderApp } from '../test/render';

const info = { name: 'Line Splitter', version: '0.1.0', platform: 'linux', electron: '45.4.1' };
const notInstalled: EngineStatus = {
  python: { ok: true, detail: 'Python 3.12.3', path: '/usr/bin/python3' },
  ffmpeg: {
    ok: true,
    detail: 'FFmpeg 6.1.1 · ffprobe 6.1.1',
    path: '/usr/bin/ffmpeg',
    ffprobePath: '/usr/bin/ffprobe',
  },
  demucs: { ok: false, detail: 'Motor não instalado (ambiente Python do app ausente).' },
  model: { ok: false, detail: 'Pesos do modelo htdemucs_6s não baixados.' },
  device: { preference: 'auto', effective: 'cpu', cudaAvailable: false, gpuName: null, warning: null },
  engineDir: '/dados/engine',
  ready: false,
};
const installed: EngineStatus = {
  ...notInstalled,
  demucs: { ok: true, detail: 'Demucs 4.1.0 · PyTorch 2.6.0+cu124' },
  device: { preference: 'auto', effective: 'cuda', cudaAvailable: true, gpuName: 'RTX 3050', warning: null },
};

function deferred() {
  let resolve: (v: unknown) => void = () => undefined;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Instalação do motor', () => {
  it('instala com etapas, log ao vivo e resultado, e atualiza o status', async () => {
    const user = userEvent.setup();
    let status = notInstalled;
    const pending = deferred();
    const install = vi.fn(() => pending.promise);
    const { bridge, emit } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({ ok: true, data: status }),
      'engine:install': install,
    });
    renderApp('/motor', bridge);
    await user.click(await screen.findByRole('button', { name: 'Instalar motor' }));
    expect(install).toHaveBeenCalledWith({ reinstall: false });

    act(() => {
      emit('engine:installStep', {
        step: 3,
        total: 5,
        label: 'Instalando o PyTorch com suporte à GPU (CUDA)',
      });
      emit('engine:installLog', { line: 'Collecting torch==2.6.0', stream: 'stdout' });
      emit('engine:installLog', { line: 'Downloading torch-2.6.0+cu124.whl', stream: 'stdout' });
      emit('engine:installLog', { lixo: true });
    });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(
      screen.getByText('Etapa 3 de 5: Instalando o PyTorch com suporte à GPU (CUDA)'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Log da instalação')).toHaveTextContent('Collecting torch==2.6.0');
    expect(screen.getByLabelText('Log da instalação')).toHaveTextContent('Downloading torch-2.6.0+cu124.whl');
    expect(screen.getByRole('button', { name: 'Cancelar instalação' })).toBeInTheDocument();

    status = installed;
    await act(async () => {
      pending.resolve({ ok: true, data: { demucs: '4.1.0', torch: '2.6.0+cu124', cuda: true } });
    });
    expect(
      await screen.findByText('Motor instalado: Demucs 4.1.0, PyTorch 2.6.0+cu124 com GPU (CUDA).'),
    ).toBeInTheDocument();
    expect(await screen.findByText('GPU: RTX 3050')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar motor' })).not.toBeInTheDocument();
  });

  it('cancelar chama o main e mostra o aviso de cancelamento', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    const cancel = vi.fn(() => {
      pending.resolve({
        ok: false,
        error: { code: 'CANCELLED', message: 'Instalação cancelada. O ambiente parcial foi removido.' },
      });
      return { ok: true, data: { cancelled: true } };
    });
    const { bridge } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({ ok: true, data: notInstalled }),
      'engine:install': () => pending.promise,
      'engine:cancelInstall': cancel,
    });
    renderApp('/motor', bridge);
    await user.click(await screen.findByRole('button', { name: 'Instalar motor' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar instalação' }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(
      await screen.findByText('Instalação cancelada. O ambiente parcial foi removido.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Instalar motor' })).toBeEnabled();
  });

  it('falha mostra mensagem legível e o log técnico', async () => {
    const user = userEvent.setup();
    const { bridge } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({ ok: true, data: notInstalled }),
      'engine:install': () => ({
        ok: false,
        error: {
          code: 'ENGINE_FAILED',
          message:
            'Sem conexão com a internet (ou o servidor de pacotes não respondeu). Verifique a rede e tente de novo.',
          details: 'ProxyError: Cannot connect to proxy',
        },
      }),
    });
    renderApp('/motor', bridge);
    await user.click(await screen.findByRole('button', { name: 'Instalar motor' }));
    expect(await screen.findByText('A instalação do motor falhou')).toBeInTheDocument();
    expect(screen.getByText(/Sem conexão com a internet/)).toBeInTheDocument();
    expect(screen.getByText('ProxyError: Cannot connect to proxy')).toBeInTheDocument();
  });

  it('sem Python o botão fica desabilitado com orientação', async () => {
    const { bridge } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({
        ok: true,
        data: {
          ...notInstalled,
          python: { ok: false, detail: 'Python não encontrado no sistema.', path: null },
        },
      }),
    });
    renderApp('/motor', bridge);
    expect(await screen.findByRole('button', { name: 'Instalar motor' })).toBeDisabled();
    expect(screen.getByText('Instale o Python primeiro (instruções acima).')).toBeInTheDocument();
  });

  it('o progresso continua ao trocar de tela e voltar', async () => {
    const user = userEvent.setup();
    const { bridge, emit } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({ ok: true, data: notInstalled }),
      'engine:install': () => new Promise(() => undefined),
      'settings:get': () => ({
        ok: true,
        data: {
          outputDir: '/m/Line Splitter',
          bitrateKbps: 320,
          device: 'auto',
          pythonPath: '',
          ffmpegPath: '',
        },
      }),
    });
    renderApp('/motor', bridge);
    await user.click(await screen.findByRole('button', { name: 'Instalar motor' }));
    act(() => emit('engine:installStep', { step: 4, total: 5, label: 'Instalando o Demucs' }));
    await user.click(screen.getByRole('link', { name: 'Configurações' }));
    expect(await screen.findByRole('button', { name: 'Instalação em andamento…' })).toBeDisabled();
    await user.click(screen.getByRole('link', { name: 'Motor' }));
    expect(await screen.findByText('Etapa 4 de 5: Instalando o Demucs')).toBeInTheDocument();
  });

  it('Reinstalar motor nas Configurações pede confirmação e inicia com reinstall', async () => {
    const user = userEvent.setup();
    const install = vi.fn(() => new Promise(() => undefined));
    const { bridge } = eventBridge({
      'app:info': () => ({ ok: true, data: info }),
      'engine:status': () => ({ ok: true, data: installed }),
      'engine:install': install,
      'settings:get': () => ({
        ok: true,
        data: {
          outputDir: '/m/Line Splitter',
          bitrateKbps: 320,
          device: 'auto',
          pythonPath: '',
          ffmpegPath: '',
        },
      }),
    });
    renderApp('/configuracoes', bridge);
    await user.click(await screen.findByRole('button', { name: 'Reinstalar motor…' }));
    expect(screen.getByRole('dialog', { name: 'Reinstalar o motor?' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(install).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Reinstalar motor…' }));
    await user.click(screen.getByRole('button', { name: 'Reinstalar' }));
    expect(install).toHaveBeenCalledWith({ reinstall: true });
    expect(await screen.findByRole('heading', { level: 1, name: 'Motor de separação' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar instalação' })).toBeInTheDocument();
  });
});
