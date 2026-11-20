import type { AudioInfo } from '@line-splitter/shared';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { bridgeWith, renderApp } from '../test/render';

const info = { name: 'Line Splitter', version: '0.1.0', platform: 'linux', electron: '45.4.1' };
const audio: AudioInfo = {
  path: '/home/u/Música/minha música.flac',
  fileName: 'minha música.flac',
  name: 'minha música',
  extension: 'flac',
  sizeBytes: 31_457_280,
  durationS: 214.6,
  container: 'flac',
  codec: 'flac',
  sampleRate: 44100,
  channels: 2,
  mediaUrl: 'media://audio/abc123',
};

function setup(
  handlers: Record<string, (p: unknown) => unknown>,
  pathForFile = (f: File) => `/soltos/${f.name}`,
) {
  const bridge = {
    ...bridgeWith({ 'app:info': () => ({ ok: true, data: info }), ...handlers }),
    pathForFile,
  };
  renderApp('/', bridge);
}

function drop(files: File[]) {
  fireEvent.drop(screen.getByRole('region', { name: 'Área para soltar o arquivo de áudio' }), {
    dataTransfer: { files, types: ['Files'] },
  });
}

describe('Tela Início', () => {
  it('estado vazio explica que o original não é alterado', async () => {
    setup({});
    expect(await screen.findByText('Nenhum arquivo escolhido')).toBeInTheDocument();
    expect(screen.getByText(/O arquivo original nunca é alterado/)).toBeInTheDocument();
  });

  it('escolher arquivo pelo diálogo nativo com filtro e mostrar metadados e player', async () => {
    const user = userEvent.setup();
    const choose = vi.fn(() => ({ ok: true, data: audio.path }));
    const inspect = vi.fn(() => ({ ok: true, data: audio }));
    setup({ 'dialog:chooseFile': choose, 'audio:inspect': inspect });
    await user.click(screen.getByRole('button', { name: 'Escolher arquivo' }));
    expect(choose).toHaveBeenCalledWith({
      title: 'Escolher arquivo de áudio',
      filters: [
        {
          name: 'Áudio (MP3, WAV, FLAC, M4A/AAC ou OGG)',
          extensions: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'],
        },
      ],
    });
    expect(inspect).toHaveBeenCalledWith({ path: audio.path });
    expect(await screen.findByRole('heading', { name: 'minha música.flac' })).toBeInTheDocument();
    expect(screen.getByText('3:34')).toBeInTheDocument();
    expect(screen.getByText('FLAC · flac · 44,1 kHz · estéreo')).toBeInTheDocument();
    expect(screen.getByText('30,0 MB')).toBeInTheDocument();
    expect(document.querySelector('audio')).toHaveAttribute('src', 'media://audio/abc123');
  });

  it('cancelar o diálogo mantém o estado vazio', async () => {
    const user = userEvent.setup();
    const inspect = vi.fn();
    setup({ 'dialog:chooseFile': () => ({ ok: true, data: null }), 'audio:inspect': inspect });
    await user.click(screen.getByRole('button', { name: 'Escolher arquivo' }));
    expect(inspect).not.toHaveBeenCalled();
    expect(screen.getByText('Nenhum arquivo escolhido')).toBeInTheDocument();
  });

  it('soltar um arquivo usa o caminho do preload e inspeciona no main', async () => {
    const inspect = vi.fn(() => ({
      ok: true,
      data: { ...audio, path: '/soltos/faixa.mp3', fileName: 'faixa.mp3' },
    }));
    setup({ 'audio:inspect': inspect });
    drop([new File([new Uint8Array(2048)], 'faixa.mp3', { type: 'audio/mpeg' })]);
    expect(await screen.findByRole('heading', { name: 'faixa.mp3' })).toBeInTheDocument();
    expect(inspect).toHaveBeenCalledWith({ path: '/soltos/faixa.mp3' });
  });

  it('validação no cliente: extensão, vazio e mais de um arquivo, sem chamar o main', async () => {
    const inspect = vi.fn();
    setup({ 'audio:inspect': inspect });
    drop([new File(['x'], 'documento.pdf')]);
    expect(
      await screen.findByText('Formato não suportado. Envie um arquivo MP3, WAV, FLAC, M4A/AAC ou OGG.'),
    ).toBeInTheDocument();
    drop([new File([], 'vazio.mp3')]);
    expect(await screen.findByText('O arquivo está vazio.')).toBeInTheDocument();
    drop([new File(['a'], 'a.mp3'), new File(['b'], 'b.mp3')]);
    expect(await screen.findByText('Envie apenas um arquivo de áudio.')).toBeInTheDocument();
    expect(inspect).not.toHaveBeenCalled();
  });

  it('erro do main (arquivo corrompido) aparece com detalhes', async () => {
    const user = userEvent.setup();
    setup({
      'dialog:chooseFile': () => ({ ok: true, data: '/x/corrompido.mp3' }),
      'audio:inspect': () => ({
        ok: false,
        error: {
          code: 'INVALID_AUDIO',
          message: 'Arquivo corrompido ou formato não suportado.',
          details: 'Invalid data found',
        },
      }),
    });
    await user.click(screen.getByRole('button', { name: 'Escolher arquivo' }));
    expect(await screen.findByText('Não foi possível usar este arquivo')).toBeInTheDocument();
    expect(screen.getByText('Arquivo corrompido ou formato não suportado.')).toBeInTheDocument();
    expect(screen.getByText('Invalid data found')).toBeInTheDocument();
  });

  it('mostra carregando e bloqueia novo envio enquanto inspeciona', async () => {
    const user = userEvent.setup();
    setup({
      'dialog:chooseFile': () => ({ ok: true, data: '/x/grande.wav' }),
      'audio:inspect': () => new Promise(() => undefined),
    });
    await user.click(screen.getByRole('button', { name: 'Escolher arquivo' }));
    expect(await screen.findByText('Lendo grande.wav…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Escolher arquivo' })).toBeDisabled();
  });

  it('soltar em qualquer lugar da janela funciona, e em outra tela leva ao Início', async () => {
    const user = userEvent.setup();
    const inspect = vi.fn(() => ({ ok: true, data: { ...audio, fileName: 'faixa.mp3' } }));
    setup({ 'audio:inspect': inspect });
    fireEvent.drop(screen.getByRole('heading', { level: 1 }), {
      dataTransfer: { files: [new File([new Uint8Array(10)], 'faixa.mp3')], types: ['Files'] },
    });
    expect(await screen.findByRole('heading', { name: 'faixa.mp3' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Histórico' }));
    fireEvent.drop(screen.getByRole('navigation', { name: 'Navegação principal' }), {
      dataTransfer: { files: [new File([new Uint8Array(10)], 'outra.mp3')], types: ['Files'] },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Início' })).toBeInTheDocument();
    expect(inspect).toHaveBeenLastCalledWith({ path: '/soltos/outra.mp3' });
  });

  it('o destaque não pisca ao passar sobre elementos internos e some ao sair da janela', () => {
    setup({});
    const zone = screen.getByRole('region', { name: 'Área para soltar o arquivo de áudio' });
    const types = { dataTransfer: { types: ['Files'], files: [] } };
    fireEvent.dragEnter(zone, types);
    fireEvent.dragEnter(screen.getByRole('button', { name: 'Escolher arquivo' }), types);
    fireEvent.dragLeave(zone, types);
    expect(zone).toHaveClass('dragging');
    expect(screen.getByText('Solte o arquivo de áudio para enviar')).toBeInTheDocument();
    fireEvent.dragLeave(screen.getByRole('button', { name: 'Escolher arquivo' }), types);
    expect(zone).not.toHaveClass('dragging');
  });

  it('enquanto inspeciona, outro arquivo solto é ignorado e a resposta antiga não sobrescreve', async () => {
    let releaseA: (v: unknown) => void = () => undefined;
    const inspect = vi.fn((payload: unknown) => {
      const p = (payload as { path: string }).path;
      if (p.endsWith('a.mp3')) {
        return new Promise((r) => {
          releaseA = r;
        });
      }
      return { ok: true, data: { ...audio, fileName: 'b.mp3' } };
    });
    setup({ 'audio:inspect': inspect });
    drop([new File(['a'], 'a.mp3')]);
    expect(await screen.findByText('Lendo a.mp3…')).toBeInTheDocument();
    drop([new File(['b'], 'b.mp3')]);
    expect(inspect).toHaveBeenCalledTimes(1);
    releaseA({ ok: true, data: { ...audio, fileName: 'a.mp3' } });
    expect(await screen.findByRole('heading', { name: 'a.mp3' })).toBeInTheDocument();
  });

  it('caminho do diálogo com extensão não aceita é recusado no cliente', async () => {
    const user = userEvent.setup();
    const inspect = vi.fn();
    setup({ 'dialog:chooseFile': () => ({ ok: true, data: '/x/documento.pdf' }), 'audio:inspect': inspect });
    await user.click(screen.getByRole('button', { name: 'Escolher arquivo' }));
    expect(
      await screen.findByText('Formato não suportado. Envie um arquivo MP3, WAV, FLAC, M4A/AAC ou OGG.'),
    ).toBeInTheDocument();
    expect(inspect).not.toHaveBeenCalled();
  });
});
