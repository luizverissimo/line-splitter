import type { HistoryItem } from '@line-splitter/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { bridgeWith, renderApp } from '../test/render';

const info = { name: 'Line Splitter', version: '0.1.0', platform: 'linux', electron: '45.4.1' };
const item = (id: number, over: Partial<HistoryItem> = {}): HistoryItem => ({
  id,
  createdAt: '2026-11-20T18:30:00.000Z',
  sourcePath: '/m/Minha Música.flac',
  sourceName: 'Minha Música',
  stem: 'vocals',
  audioDurationS: 212.4,
  processingMs: 95_000,
  device: 'cuda',
  bitrateKbps: 320,
  model: 'MelBand-RoFormer Kim FT2 Bleedless',
  instrument: { path: '/s/Minha Música - Voz.mp3', exists: true, url: `media://audio/i${id}` },
  rest: { path: '/s/Minha Música - sem Voz.mp3', exists: true, url: `media://audio/r${id}` },
  ...over,
});

function setup(handlers: Record<string, (p: unknown) => unknown>) {
  renderApp('/historico', bridgeWith({ 'app:info': () => ({ ok: true, data: info }), ...handlers }));
}

describe('Tela Histórico', () => {
  it('carrega e lista data, original, instrumento, duração do processamento e saídas', async () => {
    setup({
      'history:list': () => ({ ok: true, data: [item(2, { stem: 'drums', sourceName: 'Outra' }), item(1)] }),
    });
    expect(screen.getByText('Carregando o histórico…')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Separações' });
    const entries = within(list).getAllByRole('listitem');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent('Outra · Bateria');
    expect(entries[1]).toHaveTextContent('Minha Música · Voz');
    expect(entries[1]).toHaveTextContent(
      'áudio de 3:32 · processado em 1:35 (GPU, 320 kbps) · modelo MelBand-RoFormer Kim FT2 Bleedless',
    );
    expect(entries[1]).toHaveTextContent('Original: /m/Minha Música.flac');
    expect(entries[1]).toHaveTextContent('/s/Minha Música - Voz.mp3');
    expect(entries[1]).toHaveTextContent('/s/Minha Música - sem Voz.mp3');
    expect(entries[1]?.querySelectorAll('audio')).toHaveLength(2);
  });

  it('cada faixa existente tem "Baixar MP3"; faixa sumida não tem', async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => ({ ok: true, data: { savedTo: '/d/Minha Música - sem Voz.mp3' } }));
    setup({
      'history:list': () => ({
        ok: true,
        data: [
          item(2, {
            stem: 'drums',
            sourceName: 'Outra',
            instrument: { path: '/s/Outra - Bateria.mp3', exists: true, url: 'media://audio/x' },
            rest: { path: '/s/Outra - sem Bateria.mp3', exists: false, url: null },
          }),
          item(1),
        ],
      }),
      'file:saveCopy': save,
    });
    const [other, mine] = within(await screen.findByRole('list', { name: 'Separações' })).getAllByRole(
      'listitem',
    ) as [HTMLElement, HTMLElement];
    expect(within(other).getAllByRole('button', { name: /^Baixar MP3/ })).toHaveLength(1);
    expect(within(other).getByRole('button', { name: 'Baixar MP3: Só Bateria' })).toBeInTheDocument();
    await user.click(within(mine).getByRole('button', { name: 'Baixar MP3: Sem Voz' }));
    expect(save).toHaveBeenCalledWith({ path: '/s/Minha Música - sem Voz.mp3' });
    expect(await within(mine).findByRole('status')).toHaveTextContent(
      'Salvo em /d/Minha Música - sem Voz.mp3',
    );
    await user.click(within(mine).getByRole('button', { name: 'Baixar MP3: Só Voz' }));
    expect(save).toHaveBeenLastCalledWith({ path: '/s/Minha Música - Voz.mp3' });
  });

  it('arquivo não encontrado desabilita ouvir; abrir pasta usa uma saída existente', async () => {
    const user = userEvent.setup();
    const open = vi.fn(() => ({ ok: true, data: { opened: true } }));
    setup({
      'history:list': () => ({
        ok: true,
        data: [item(1, { instrument: { path: '/s/Minha Música - Voz.mp3', exists: false, url: null } })],
      }),
      'shell:openFolder': open,
    });
    const entry = within(await screen.findByRole('list', { name: 'Separações' })).getAllByRole(
      'listitem',
    )[0] as HTMLElement;
    expect(within(entry).getByText('Arquivo não encontrado')).toBeInTheDocument();
    expect(entry.querySelectorAll('audio')).toHaveLength(1);
    await user.click(within(entry).getByRole('button', { name: 'Abrir pasta' }));
    expect(open).toHaveBeenCalledWith({ path: '/s/Minha Música - sem Voz.mp3' });
  });

  it('sem nenhuma saída no disco, Abrir pasta fica desabilitado', async () => {
    setup({
      'history:list': () => ({
        ok: true,
        data: [
          item(1, {
            instrument: { path: '/s/a.mp3', exists: false, url: null },
            rest: { path: '/s/b.mp3', exists: false, url: null },
          }),
        ],
      }),
    });
    const entry = within(await screen.findByRole('list', { name: 'Separações' })).getAllByRole(
      'listitem',
    )[0] as HTMLElement;
    expect(within(entry).getByRole('button', { name: 'Abrir pasta' })).toBeDisabled();
  });

  it('estado vazio convida para a primeira separação', async () => {
    const user = userEvent.setup();
    setup({ 'history:list': () => ({ ok: true, data: [] }) });
    expect(await screen.findByRole('heading', { name: 'Nenhuma separação ainda' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Fazer a primeira separação' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Início');
  });

  it('erro ao carregar com nova tentativa', async () => {
    const user = userEvent.setup();
    let fail = true;
    setup({
      'history:list': () =>
        fail
          ? { ok: false, error: { code: 'INTERNAL', message: 'Banco indisponível.' } }
          : { ok: true, data: [] },
    });
    expect(await screen.findByText('Não foi possível carregar o histórico')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Nenhuma separação ainda')).toBeInTheDocument();
  });

  it('remover pede confirmação; com e sem apagar os MP3', async () => {
    const user = userEvent.setup();
    let items = [item(2), item(1)];
    const remove = vi.fn((payload: unknown) => {
      const { id } = payload as { id: number };
      items = items.filter((i) => i.id !== id);
      return { ok: true, data: { removed: true, deletedFiles: [] } };
    });
    setup({ 'history:list': () => ({ ok: true, data: items }), 'history:remove': remove });
    const entries = within(await screen.findByRole('list', { name: 'Separações' })).getAllByRole('listitem');
    await user.click(within(entries[0] as HTMLElement).getByRole('button', { name: 'Remover' }));
    const dialog = screen.getByRole('dialog', { name: 'Remover do histórico?' });
    expect(within(dialog).getByText('O arquivo original nunca é apagado.')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(within(entries[0] as HTMLElement).getByRole('button', { name: 'Remover' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('checkbox', { name: 'Apagar também os arquivos MP3' }),
    );
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover' }));
    expect(remove).toHaveBeenCalledWith({ id: 2, deleteFiles: true });
    await waitFor(() =>
      expect(within(screen.getByRole('list', { name: 'Separações' })).getAllByRole('listitem')).toHaveLength(
        1,
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(within(screen.getByRole('dialog')).getByRole('checkbox')).not.toBeChecked();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover' }));
    expect(remove).toHaveBeenLastCalledWith({ id: 1, deleteFiles: false });
    expect(await screen.findByText('Nenhuma separação ainda')).toBeInTheDocument();
  });

  it('erro ao apagar é mostrado no diálogo e o item continua', async () => {
    const user = userEvent.setup();
    setup({
      'history:list': () => ({ ok: true, data: [item(1)] }),
      'history:remove': () => ({
        ok: false,
        error: { code: 'IO', message: 'Não foi possível apagar /s/x.mp3. O item continua no histórico.' },
      }),
    });
    await user.click(await screen.findByRole('button', { name: 'Remover' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('checkbox'));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover' }));
    expect(await screen.findByText(/O item continua no histórico/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Separações' })).getAllByRole('listitem')).toHaveLength(1);
  });
});
