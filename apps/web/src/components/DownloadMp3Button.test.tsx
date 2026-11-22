import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { bridgeWith } from '../test/render';
import { DownloadMp3Button } from './DownloadMp3Button';

const track = '/saida/Minha Música - Voz.mp3';

function setup(save: (p: unknown) => unknown) {
  window.api = bridgeWith({ 'file:saveCopy': save });
  render(<DownloadMp3Button path={track} trackTitle="Só Voz" />);
  return screen.getByRole('button', { name: 'Baixar MP3: Só Voz' });
}

describe('Baixar MP3', () => {
  it('pede ao main para salvar a faixa e mostra onde foi salvo', async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => ({ ok: true, data: { savedTo: '/home/u/Downloads/Minha Música - Voz.mp3' } }));
    const button = setup(save);
    expect(button).toHaveTextContent('Baixar MP3');
    await user.click(button);
    expect(save).toHaveBeenCalledWith({ path: track });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Salvo em /home/u/Downloads/Minha Música - Voz.mp3',
    );
  });

  it('cancelar o diálogo não mostra mensagem nenhuma', async () => {
    const user = userEvent.setup();
    const save = vi.fn(() => ({ ok: true, data: null }));
    const button = setup(save);
    await user.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    expect(save).toHaveBeenCalledOnce();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('enquanto salva, o botão mostra "Salvando…" e fica ocupado', async () => {
    const user = userEvent.setup();
    let release: (v: unknown) => void = () => undefined;
    const save = vi.fn(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const button = setup(save);
    await user.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveTextContent('Salvando…');
    await user.click(button);
    expect(save).toHaveBeenCalledOnce();
    release({ ok: true, data: { savedTo: '/d/x.mp3' } });
    await waitFor(() => expect(button).toBeEnabled());
    expect(button).toHaveTextContent('Baixar MP3');
  });

  it.each([
    ['NOT_FOUND', 'Arquivo não encontrado. Ele pode ter sido movido ou apagado.'],
    ['FORBIDDEN', 'Sem permissão para gravar em /root. Escolha outra pasta.'],
    ['IO', 'Não há espaço livre no disco de destino. Libere espaço ou escolha outro lugar.'],
  ])('erro %s aparece com a mensagem do main', async (code, message) => {
    const user = userEvent.setup();
    const button = setup(() => ({ ok: false, error: { code, message, details: 'detalhe técnico' } }));
    await user.click(button);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível salvar o MP3');
    expect(alert).toHaveTextContent(message);
    expect(alert).toHaveTextContent('detalhe técnico');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
