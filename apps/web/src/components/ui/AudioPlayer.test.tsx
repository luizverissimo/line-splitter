import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer } from './AudioPlayer';

// jsdom não decodifica áudio: simulamos só a camada do elemento de mídia, dentro do teste.
let paused = true;
beforeEach(() => {
  paused = true;
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(() => paused);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    paused = false;
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    paused = true;
    this.dispatchEvent(new Event('pause'));
  });
});
afterEach(() => vi.restoreAllMocks());

function loadMetadata(duration: number) {
  const audio = document.querySelector('audio');
  if (!audio) throw new Error('sem <audio>');
  Object.defineProperty(audio, 'duration', { configurable: true, value: duration });
  fireEvent(audio, new Event('loadedmetadata'));
  return audio;
}

describe('AudioPlayer', () => {
  it('fica desabilitado até carregar os metadados e mostra a duração', () => {
    render(<AudioPlayer src="media://audio/abc" title="Voz" />);
    expect(screen.getByRole('button', { name: 'Tocar Voz' })).toBeDisabled();
    expect(screen.getByText('--:--')).toBeInTheDocument();
    loadMetadata(125);
    expect(screen.getByRole('button', { name: 'Tocar Voz' })).toBeEnabled();
    expect(screen.getByText('2:05')).toBeInTheDocument();
    expect(document.querySelector('audio')).toHaveAttribute('src', 'media://audio/abc');
  });

  it('play/pause alterna o botão', async () => {
    const user = userEvent.setup();
    render(<AudioPlayer src="media://audio/abc" title="Voz" />);
    loadMetadata(60);
    await user.click(screen.getByRole('button', { name: 'Tocar Voz' }));
    expect(screen.getByRole('button', { name: 'Pausar Voz' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Pausar Voz' }));
    expect(screen.getByRole('button', { name: 'Tocar Voz' })).toBeInTheDocument();
  });

  it('barra de posição avança com o tempo e permite buscar', () => {
    render(<AudioPlayer src="media://audio/abc" title="Voz" />);
    const audio = loadMetadata(200);
    const seek = screen.getByRole('slider', { name: 'Posição em Voz' });
    fireEvent.change(seek, { target: { value: '90' } });
    expect(audio.currentTime).toBe(90);
    expect(seek).toHaveAttribute('aria-valuetext', '1:30 de 3:20');

    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 95.4, writable: true });
    fireEvent(audio, new Event('timeupdate'));
    expect(seek).toHaveValue('95.4');
  });

  it('volume e silenciar', async () => {
    const user = userEvent.setup();
    render(<AudioPlayer src="media://audio/abc" title="Voz" />);
    const audio = loadMetadata(10);
    fireEvent.change(screen.getByRole('slider', { name: 'Volume de Voz' }), { target: { value: '0.3' } });
    expect(audio.volume).toBeCloseTo(0.3);
    await user.click(screen.getByRole('button', { name: 'Silenciar Voz' }));
    expect(audio.muted).toBe(true);
    expect(screen.getByRole('button', { name: 'Ativar som de Voz' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('erro de carregamento mostra mensagem e desabilita o play', () => {
    render(<AudioPlayer src="media://audio/sumiu" title="Resto" />);
    fireEvent(document.querySelector('audio') as HTMLAudioElement, new Event('error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar o áudio');
    expect(screen.getByRole('button', { name: 'Tocar Resto' })).toBeDisabled();
  });

  it('falha ao tocar aparece como erro', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('formato não suportado'));
    const user = userEvent.setup();
    render(<AudioPlayer src="media://audio/abc" title="Voz" />);
    loadMetadata(10);
    await user.click(screen.getByRole('button', { name: 'Tocar Voz' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível tocar: formato não suportado');
  });

  it('trocar a faixa reinicia o estado do player', () => {
    const { rerender } = render(<AudioPlayer src="media://audio/a" title="Voz" />);
    loadMetadata(125);
    fireEvent(document.querySelector('audio') as HTMLAudioElement, new Event('error'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<AudioPlayer src="media://audio/b" title="Voz" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('--:--')).toBeInTheDocument();
    expect(document.querySelector('audio')).toHaveAttribute('src', 'media://audio/b');
  });

  it('reativar o som depois de zerar o volume restaura o último volume audível', async () => {
    const user = userEvent.setup();
    render(<AudioPlayer src="media://audio/abc" title="Voz" />);
    const audio = loadMetadata(10);
    const volume = screen.getByRole('slider', { name: 'Volume de Voz' });
    fireEvent.change(volume, { target: { value: '0.4' } });
    fireEvent.change(volume, { target: { value: '0' } });
    expect(audio.muted).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Ativar som de Voz' }));
    expect(audio.muted).toBe(false);
    expect(audio.volume).toBeCloseTo(0.4);
    expect(volume).toHaveValue('0.4');
  });

  it('timeupdate não move a barra enquanto o usuário arrasta', () => {
    render(<AudioPlayer src="media://audio/abc" title="Voz" />);
    const audio = loadMetadata(100);
    const seek = screen.getByRole('slider', { name: 'Posição em Voz' });
    fireEvent.pointerDown(seek);
    fireEvent.change(seek, { target: { value: '50' } });
    Object.defineProperty(audio, 'currentTime', { configurable: true, value: 12, writable: true });
    fireEvent(audio, new Event('timeupdate'));
    expect(seek).toHaveValue('50');
    fireEvent.pointerUp(seek);
    fireEvent(audio, new Event('timeupdate'));
    expect(seek).toHaveValue('12');
  });
});
