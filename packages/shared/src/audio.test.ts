import { describe, expect, it } from 'vitest';
import './zod-locale';
import {
  audioInspectInputSchema,
  checkAudioFileBasics,
  extensionOf,
  isAcceptedExtension,
  tooLongMessage,
} from './audio';

describe('regras de arquivo de áudio', () => {
  it('extensões aceitas, sem diferenciar maiúsculas', () => {
    expect(['a.mp3', 'b.WAV', 'c.flac', 'd.m4a', 'e.aac', 'f.Ogg'].every(isAcceptedExtension)).toBe(true);
    expect(isAcceptedExtension('g.wma')).toBe(false);
    expect(isAcceptedExtension('sem-extensao')).toBe(false);
    expect(extensionOf('.mp3')).toBe('');
    expect(extensionOf('minha.musica.v2.FLAC')).toBe('flac');
  });

  it('tamanho: vazio, limite exato e acima', () => {
    expect(checkAudioFileBasics('a.mp3', 0)).toBe('O arquivo está vazio.');
    expect(checkAudioFileBasics('a.mp3', 500 * 1024 * 1024)).toBeNull();
    expect(checkAudioFileBasics('a.mp3', 500 * 1024 * 1024 + 1)).toMatch(/^Arquivo grande demais/);
    expect(checkAudioFileBasics('a.pdf', 10)).toBe(
      'Formato não suportado. Envie um arquivo MP3, WAV, FLAC, M4A/AAC ou OGG.',
    );
  });

  it('mensagem de duração', () => {
    expect(tooLongMessage(1861)).toBe('Áudio longo demais (31:01). O limite é 30:00.');
    expect(tooLongMessage(1800.3)).toBe('Áudio longo demais (30:01). O limite é 30:00.');
  });

  it('caminho absoluto obrigatório', () => {
    expect(audioInspectInputSchema.safeParse({ path: '/home/u/a.mp3' }).success).toBe(true);
    expect(audioInspectInputSchema.safeParse({ path: 'C:\\Users\\u\\a.mp3' }).success).toBe(true);
    expect(audioInspectInputSchema.safeParse({ path: 'a.mp3' }).success).toBe(false);
  });
});
