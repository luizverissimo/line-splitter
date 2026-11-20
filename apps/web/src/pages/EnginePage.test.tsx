import type { EngineStatus } from '@line-splitter/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { bridgeWith, renderApp } from '../test/render';

const info = (platform: string) => ({
  name: 'Line Splitter',
  version: '0.1.0',
  platform,
  electron: '45.4.1',
});
const ready: EngineStatus = {
  python: { ok: true, detail: 'Python 3.12.3', path: '/usr/bin/python3' },
  ffmpeg: { ok: true, detail: 'FFmpeg 6.1.1', path: '/usr/bin/ffmpeg', ffprobePath: '/usr/bin/ffprobe' },
  demucs: { ok: true, detail: 'Demucs 4.0.1 · PyTorch 2.5.1' },
  model: { ok: true, detail: 'Modelo htdemucs_6s (80 MB)' },
  device: { preference: 'auto', effective: 'cuda', cudaAvailable: true, gpuName: 'RTX 3050', warning: null },
  engineDir: '/home/u/.config/Line Splitter/engine',
  ready: true,
};
const missing: EngineStatus = {
  ...ready,
  python: { ok: false, detail: 'Python não encontrado no sistema.', path: null },
  ffmpeg: { ok: false, detail: 'FFmpeg não encontrado no sistema.', path: null, ffprobePath: null },
  demucs: { ok: false, detail: 'Motor não instalado (ambiente Python do app ausente).' },
  model: { ok: false, detail: 'Pesos do modelo htdemucs_6s não baixados.' },
  device: {
    preference: 'cuda',
    effective: 'cpu',
    cudaAvailable: false,
    gpuName: null,
    warning: 'GPU indisponível.',
  },
  ready: false,
};

function setup(path: string, status: () => unknown, platform = 'linux', appInfo?: () => unknown) {
  renderApp(
    path,
    bridgeWith({
      'app:info': appInfo ?? (() => ({ ok: true, data: info(platform) })),
      'engine:status': status,
    }),
  );
}

describe('Tela Motor', () => {
  it('lista cada item com ✔ e o dispositivo em uso', async () => {
    setup('/motor', () => ({ ok: true, data: ready }));
    expect(screen.getByText('Verificando o motor…')).toBeInTheDocument();
    expect(await screen.findByText('Tudo pronto para separar.')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Itens do motor' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(within(list).getByText('Python 3.12.3')).toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Python: pronto');
    expect(screen.getByText('GPU: RTX 3050')).toBeInTheDocument();
    expect(screen.queryByText(/Instalar o Python/)).not.toBeInTheDocument();
  });

  it('itens com ✖ mostram motivo e instruções do Linux', async () => {
    setup('/motor', () => ({ ok: true, data: missing }));
    expect(await screen.findByText(/O motor ainda não está pronto/)).toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'Itens do motor' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Python: com problema');
    expect(items[3]).toHaveTextContent('Modelo htdemucs_6s: com problema');
    expect(screen.getByText('Pesos do modelo htdemucs_6s não baixados.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Instalar o Python no Linux' })).toBeInTheDocument();
    expect(screen.getByText('sudo apt install python3 python3-venv')).toBeInTheDocument();
    expect(screen.getByText('sudo apt install ffmpeg')).toBeInTheDocument();
    expect(screen.getByText('GPU indisponível.')).toBeInTheDocument();
    expect(screen.getByText(/definido depois de instalar o motor/)).toBeInTheDocument();
  });

  it('motor instalado sem CUDA mostra CPU', async () => {
    setup('/motor', () => ({
      ok: true,
      data: {
        ...ready,
        device: { preference: 'auto', effective: 'cpu', cudaAvailable: false, gpuName: null, warning: null },
      },
    }));
    expect(await screen.findByText('CPU')).toBeInTheDocument();
  });

  it('instruções do Windows na plataforma Windows', async () => {
    setup('/motor', () => ({ ok: true, data: missing }), 'win32');
    expect(await screen.findByRole('heading', { name: 'Instalar o Python no Windows' })).toBeInTheDocument();
    expect(await screen.findByText('winget install -e --id Python.Python.3.12')).toBeInTheDocument();
    expect(screen.getByText('winget install -e --id Gyan.FFmpeg')).toBeInTheDocument();
  });

  it('sem saber a plataforma mostra instruções de Linux e Windows com aviso', async () => {
    setup(
      '/motor',
      () => ({ ok: true, data: missing }),
      'linux',
      () => ({
        ok: false,
        error: { code: 'INTERNAL', message: 'falhou' },
      }),
    );
    expect(await screen.findByText(/Não foi possível identificar o sistema operacional/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Instalar o Python no Linux' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Instalar o Python no Windows' })).toBeInTheDocument();
  });

  it('enquanto a plataforma carrega não mostra instruções de nenhum sistema', async () => {
    setup(
      '/motor',
      () => ({ ok: true, data: missing }),
      'linux',
      () => new Promise(() => undefined),
    );
    expect(await screen.findByText(/O motor ainda não está pronto/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Instalar o Python/ })).not.toBeInTheDocument();
  });

  it('"Verificar de novo" refaz a verificação', async () => {
    const user = userEvent.setup();
    let current = missing;
    setup('/motor', () => ({ ok: true, data: current }));
    expect(await screen.findByText(/O motor ainda não está pronto/)).toBeInTheDocument();
    current = ready;
    await user.click(screen.getByRole('button', { name: 'Verificar de novo' }));
    expect(await screen.findByText('Tudo pronto para separar.')).toBeInTheDocument();
  });

  it('erro na verificação oferece nova tentativa', async () => {
    setup('/motor', () => ({
      ok: false,
      error: { code: 'INTERNAL', message: 'Falha ao executar o Python.' },
    }));
    expect(await screen.findByText('Não foi possível verificar o motor')).toBeInTheDocument();
    expect(screen.getByText('Falha ao executar o Python.')).toBeInTheDocument();
  });
});

describe('Redirecionamento na abertura', () => {
  it('motor incompleto leva do Início para a tela Motor', async () => {
    setup('/', () => ({ ok: true, data: missing }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Motor de separação' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/motor$/);
  });

  it('motor pronto fica no Início', async () => {
    let calls = 0;
    setup('/', () => {
      calls += 1;
      return { ok: true, data: ready };
    });
    await waitFor(() => expect(calls).toBe(1));
    await screen.findByText('Line Splitter 0.1.0 · Linux · Electron 45.4.1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Início' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('se a primeira verificação falhar, uma verificação posterior não redireciona sozinha', async () => {
    let fail = true;
    let calls = 0;
    const { queryClient } = renderApp(
      '/',
      bridgeWith({
        'app:info': () => ({ ok: true, data: info('linux') }),
        'engine:status': () => {
          calls += 1;
          return fail
            ? { ok: false, error: { code: 'INTERNAL', message: 'falhou' } }
            : { ok: true, data: missing };
        },
      }),
    );
    await waitFor(() => expect(calls).toBeGreaterThan(0));
    await waitFor(() => expect(queryClient.getQueryState(['engine', 'status'])?.status).toBe('error'));
    // A resposta bem-sucedida chega com o usuário ainda no Início.
    fail = false;
    await act(() => queryClient.refetchQueries({ queryKey: ['engine', 'status'] }));
    await waitFor(() => expect(queryClient.getQueryState(['engine', 'status'])?.status).toBe('success'));
    // Deixa os efeitos e a navegação assíncrona do React Router terminarem antes de conferir.
    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Início');
  });

  it('se o usuário navegar antes da primeira verificação, não é redirecionado', async () => {
    const user = userEvent.setup();
    let release: (v: unknown) => void = () => undefined;
    renderApp(
      '/',
      bridgeWith({
        'app:info': () => ({ ok: true, data: info('linux') }),
        'engine:status': () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      }),
    );
    await user.click(screen.getByRole('link', { name: 'Histórico' }));
    await user.click(screen.getByRole('link', { name: 'Início' }));
    await act(async () => {
      release({ ok: true, data: missing });
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(resolve));
    });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Início');
  });
});
