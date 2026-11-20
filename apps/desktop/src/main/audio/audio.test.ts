import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fixtures } from '../../../../../scripts/fixtures.mjs';
import { detectFfmpeg } from '../engine/detect';
import { inspectAudio } from './inspect';
import { openDatabase } from '../db/database';
import { audioHandlers, CurrentInput } from '../handlers/audio';
import { MediaRegistry } from '../media/registry';
import { SettingsRepository } from '../settings/repository';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-audio-'));
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

async function ffprobe() {
  const f = await detectFfmpeg('');
  if (!f.ffprobePath) throw new Error('Testes de áudio exigem FFmpeg/ffprobe no PATH.');
  return f.ffprobePath;
}
const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('inspectAudio com arquivos reais', () => {
  it.each([
    ['wav', fixtures.wav, 'pcm_s16le', 'wav'],
    ['mp3', fixtures.mp3, 'mp3', 'mp3'],
    ['flac', fixtures.flac, 'flac', 'flac'],
    ['m4a', fixtures.m4a, 'aac', 'mov,mp4,m4a,3gp,3g2,mj2'],
    ['ogg', fixtures.ogg, 'vorbis', 'ogg'],
    ['aac', fixtures.aac, 'aac', 'aac'],
  ])('%s: lê metadados sem alterar o arquivo', async (ext, file, codec, container) => {
    const before = sha(file);
    const mtime = fs.statSync(file).mtimeMs;
    const info = await inspectAudio(file, await ffprobe());
    expect(info).toMatchObject({
      path: file,
      fileName: `musica-curta.${ext}`,
      name: 'musica-curta',
      extension: ext,
      codec,
      container,
      sampleRate: 44100,
      channels: 2,
    });
    expect(info.durationS).toBeGreaterThan(7.8);
    expect(info.durationS).toBeLessThan(8.2);
    expect(info.sizeBytes).toBe(fs.statSync(file).size);
    expect(sha(file)).toBe(before);
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
    expect(fs.readdirSync(path.dirname(file)).filter((f) => f.includes('parcial'))).toEqual([]);
  });

  it('nome com espaços, acentos e vários pontos', async () => {
    const copy = path.join(tmp, 'Minha Música v1.2 (ao vivo).mp3');
    fs.copyFileSync(fixtures.mp3, copy);
    const info = await inspectAudio(copy, await ffprobe());
    expect(info.name).toBe('Minha Música v1.2 (ao vivo)');
    expect(info.extension).toBe('mp3');
  });

  it('extensão em maiúsculas é aceita', async () => {
    const copy = path.join(tmp, 'GRAVACAO.WAV');
    fs.copyFileSync(fixtures.wav, copy);
    expect((await inspectAudio(copy, await ffprobe())).extension).toBe('wav');
  });
});

describe('inspectAudio recusa com mensagem em português', () => {
  it('arquivo corrompido', async () => {
    await expect(inspectAudio(fixtures.corrupted, await ffprobe())).rejects.toMatchObject({
      code: 'INVALID_AUDIO',
      message: 'Arquivo corrompido ou formato não suportado.',
    });
  });

  it('texto com extensão de áudio', async () => {
    await expect(inspectAudio(fixtures.notAudio, await ffprobe())).rejects.toMatchObject({
      code: 'INVALID_AUDIO',
      message: 'Arquivo corrompido ou formato não suportado.',
    });
  });

  it('extensão não aceita, mesmo sendo áudio válido', async () => {
    await expect(inspectAudio(fixtures.wrongExtension, await ffprobe())).rejects.toMatchObject({
      code: 'INVALID_AUDIO',
      message: 'Formato não suportado. Envie um arquivo MP3, WAV, FLAC, M4A/AAC ou OGG.',
    });
  });

  it('acima de 500 MB (antes de chamar o ffprobe)', async () => {
    await expect(inspectAudio(fixtures.tooLarge, '/caminho/que/nao/existe/ffprobe')).rejects.toMatchObject({
      code: 'INVALID_AUDIO',
      message: 'Arquivo grande demais (501,0 MB). O limite é 500,0 MB.',
    });
  });

  it('acima de 30 minutos', async () => {
    await expect(inspectAudio(fixtures.tooLong, await ffprobe())).rejects.toMatchObject({
      code: 'INVALID_AUDIO',
      message: 'Áudio longo demais (31:00). O limite é 30:00.',
    });
  });

  it('arquivo inexistente, pasta e vazio', async () => {
    await expect(inspectAudio(path.join(tmp, 'sumiu.mp3'), await ffprobe())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    const dir = path.join(tmp, 'pasta.mp3');
    fs.mkdirSync(dir);
    await expect(inspectAudio(dir, await ffprobe())).rejects.toMatchObject({
      message: 'O caminho escolhido não é um arquivo.',
    });
    const empty = path.join(tmp, 'vazio.ogg');
    fs.writeFileSync(empty, '');
    await expect(inspectAudio(empty, await ffprobe())).rejects.toMatchObject({
      message: 'O arquivo está vazio.',
    });
  });

  it('ffprobe ausente vira erro do motor', async () => {
    await expect(inspectAudio(fixtures.mp3, path.join(tmp, 'ffprobe-inexistente'))).rejects.toMatchObject({
      code: 'ENGINE_MISSING',
    });
  });
});

describe('canal audio:inspect', () => {
  it('valida a entrada, devolve metadados e libera só o arquivo atual no protocolo de mídia', async () => {
    const userData = fs.mkdtempSync(path.join(tmp, 'ipc-'));
    const db = openDatabase(userData);
    try {
      const repo = new SettingsRepository(db, {
        outputDir: path.join(userData, 'saida'),
        bitrateKbps: 320,
        device: 'auto',
        pythonPath: '',
        ffmpegPath: '',
      });
      const media = new MediaRegistry();
      const h = audioHandlers(repo, new CurrentInput(media));
      const first = await h['audio:inspect']({ path: fixtures.wav });
      expect(first).toMatchObject({
        ok: true,
        data: { fileName: 'musica-curta.wav', mediaUrl: expect.stringMatching(/^media:\/\/audio\//) },
      });
      const url = (first as { data: { mediaUrl: string } }).data.mediaUrl;
      expect(media.resolve(url)).toBe(fixtures.wav);

      const second = await h['audio:inspect']({ path: fixtures.mp3 });
      expect(second.ok).toBe(true);
      expect(media.resolve(url)).toBeNull();
      expect(media.has(fixtures.mp3)).toBe(true);

      await expect(h['audio:inspect']({ path: 'relativo.mp3' })).resolves.toMatchObject({
        ok: false,
        error: { code: 'VALIDATION', message: expect.stringContaining('absoluto') },
      });
      await expect(h['audio:inspect']({ path: fixtures.corrupted })).resolves.toMatchObject({
        ok: false,
        error: { code: 'INVALID_AUDIO' },
      });
      expect(media.has(fixtures.corrupted)).toBe(false);
    } finally {
      db.close();
    }
  });
});
