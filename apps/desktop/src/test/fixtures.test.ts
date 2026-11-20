import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SHORT_DURATION_S, fixtures } from '../../../../scripts/fixtures.mjs';
import { probe } from './audio';

describe('fixtures de áudio gerados pelo FFmpeg', () => {
  it.each([
    ['wav', fixtures.wav, 'pcm_s16le'],
    ['mp3', fixtures.mp3, 'mp3'],
    ['flac', fixtures.flac, 'flac'],
    ['m4a', fixtures.m4a, 'aac'],
    ['ogg', fixtures.ogg, 'vorbis'],
    ['aac', fixtures.aac, 'aac'],
  ])('%s é estéreo 44,1 kHz de ~8 s', (_name, file, codec) => {
    const info = probe(file);
    expect(info.codec).toBe(codec);
    expect(info.sampleRate).toBe(44100);
    expect(info.channels).toBe(2);
    expect(info.durationS).toBeGreaterThan(SHORT_DURATION_S - 0.2);
    expect(info.durationS).toBeLessThan(SHORT_DURATION_S + 0.2);
  });

  it('mp3 informa bitrate', () => {
    expect(probe(fixtures.mp3).bitRate).toBe(192000);
  });

  it('arquivos inválidos não são lidos pelo ffprobe', () => {
    expect(() => probe(fixtures.corrupted)).toThrow(/não conseguiu ler|Nenhuma faixa/);
    expect(() => probe(fixtures.notAudio)).toThrow(/não conseguiu ler|Nenhuma faixa/);
  });

  it('arquivo com extensão não aceita é áudio válido', () => {
    expect(probe(fixtures.wrongExtension).codec).toBe('mp3');
  });

  it('limites: 501 MB e 31 min', () => {
    expect(fs.statSync(fixtures.tooLarge).size).toBeGreaterThan(500 * 1024 * 1024);
    expect(probe(fixtures.tooLong).durationS).toBeCloseTo(31 * 60, 0);
  });
});
