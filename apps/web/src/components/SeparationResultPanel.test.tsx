import type { SeparationResult } from '@line-splitter/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { bridgeWith } from '../test/render';
import { SeparationResultPanel } from './SeparationResultPanel';

const result: SeparationResult = {
  id: 7,
  stem: 'guitar',
  sourcePath: '/m/Minha Música.flac',
  instrumentPath: '/saida/Minha Música - Guitarra-Violão.mp3',
  restPath: '/saida/Minha Música - sem Guitarra-Violão.mp3',
  instrumentUrl: 'media://audio/aaa',
  restUrl: 'media://audio/bbb',
  processingMs: 95_000,
  device: 'cuda',
};

function setup(handlers: Record<string, (p: unknown) => unknown> = {}) {
  window.api = bridgeWith(handlers);
  const onSeparateAnother = vi.fn();
  const onNewFile = vi.fn();
  render(
    <SeparationResultPanel result={result} onSeparateAnother={onSeparateAnother} onNewFile={onNewFile} />,
  );
  return { onSeparateAnother, onNewFile };
}

describe('Tela de resultado', () => {
  it('mostra os dois MP3 com players apontando para o media://', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeInTheDocument();
    expect(screen.getByText('Processado em 1:35 usando a GPU.')).toBeInTheDocument();
    expect(screen.getByText('Só Guitarra/Violão')).toBeInTheDocument();
    expect(screen.getByText('Sem Guitarra/Violão')).toBeInTheDocument();
    expect(screen.getByText('Minha Música - Guitarra-Violão.mp3')).toBeInTheDocument();
    expect(screen.getByText('Minha Música - sem Guitarra-Violão.mp3')).toBeInTheDocument();
    const audios = Array.from(document.querySelectorAll('audio')).map((a) => a.getAttribute('src'));
    expect(audios).toEqual(['media://audio/aaa', 'media://audio/bbb']);
  });

  it('Abrir pasta e Mostrar arquivo chamam o main com o caminho da saída', async () => {
    const user = userEvent.setup();
    const open = vi.fn(() => ({ ok: true, data: { opened: true } }));
    const show = vi.fn(() => ({ ok: true, data: { shown: true } }));
    setup({ 'shell:openFolder': open, 'shell:showFile': show });
    await user.click(screen.getByRole('button', { name: 'Abrir pasta' }));
    expect(open).toHaveBeenCalledWith({ path: result.instrumentPath });
    const [showInstrument, showRest] = screen.getAllByRole('button', { name: 'Mostrar arquivo' });
    await user.click(showRest as HTMLElement);
    expect(show).toHaveBeenCalledWith({ path: result.restPath });
    await user.click(showInstrument as HTMLElement);
    expect(show).toHaveBeenLastCalledWith({ path: result.instrumentPath });
  });

  it('erro ao mostrar um arquivo apagado aparece na tela', async () => {
    const user = userEvent.setup();
    setup({
      'shell:showFile': () => ({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Arquivo não encontrado. Ele pode ter sido movido ou apagado.' },
      }),
    });
    await user.click(screen.getAllByRole('button', { name: 'Mostrar arquivo' })[0] as HTMLElement);
    expect(
      await screen.findByText('Arquivo não encontrado. Ele pode ter sido movido ou apagado.'),
    ).toBeInTheDocument();
  });

  it('Separar outro instrumento e Novo arquivo', async () => {
    const user = userEvent.setup();
    const { onSeparateAnother, onNewFile } = setup();
    await user.click(screen.getByRole('button', { name: 'Separar outro instrumento' }));
    expect(onSeparateAnother).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Novo arquivo' }));
    expect(onNewFile).toHaveBeenCalledOnce();
  });

  it('enquanto o sistema abre a pasta, os botões ficam desabilitados', async () => {
    const user = userEvent.setup();
    let release: (v: unknown) => void = () => undefined;
    const open = vi.fn(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    setup({ 'shell:openFolder': open });
    await user.click(screen.getByRole('button', { name: 'Abrir pasta' }));
    expect(screen.getByRole('button', { name: 'Abrir pasta' })).toBeDisabled();
    for (const b of screen.getAllByRole('button', { name: 'Mostrar arquivo' })) expect(b).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Abrir pasta' }));
    expect(open).toHaveBeenCalledOnce();
    release({ ok: true, data: { opened: true } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir pasta' })).toBeEnabled());
  });
});
