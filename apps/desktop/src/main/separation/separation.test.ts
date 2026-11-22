import type { SeparationProgress, Settings } from '@line-splitter/shared';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestEngine } from '../../../../../e2e/engine-fixture';
import { fixtures } from '../../../../../scripts/fixtures.mjs';
import { probe } from '../../test/audio';
import { openDatabase, type Db } from '../db/database';
import { enginePaths } from '../engine/paths';
import { HistoryRepository } from '../history/repository';
import { MediaRegistry } from '../media/registry';
import { outputPaths, safeFileName } from './naming';
import { parseSeparatorProgress } from './runner';
import { SeparationService } from './service';

const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

describe('nomes e progresso', () => {
  it('nomes de saída e sufixo de conflito', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-nomes-'));
    try {
      expect(outputPaths(dir, 'Minha Música', 'Voz')).toEqual({
        instrument: path.join(dir, 'Minha Música - Voz.mp3'),
        rest: path.join(dir, 'Minha Música - sem Voz.mp3'),
      });
      fs.writeFileSync(path.join(dir, 'Minha Música - Voz.mp3'), 'x');
      fs.writeFileSync(path.join(dir, 'Minha Música - Voz (2).mp3'), 'x');
      expect(outputPaths(dir, 'Minha Música', 'Voz').instrument).toBe(
        path.join(dir, 'Minha Música - Voz (3).mp3'),
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    expect(safeFileName('a/b:c*?.')).toBe('a_b_c__');
  });

  it('lê a porcentagem do tqdm do separador', () => {
    expect(parseSeparatorProgress(' 50%|█████     | 5.85/11.7 [00:01<00:01]')).toBe(50);
    expect(parseSeparatorProgress('  0%|  | 0/11.7\r 33%|██ | 3.9/11.7\r 66%|████ |')).toBe(66);
    expect(parseSeparatorProgress('Separating track x.wav')).toBeNull();
  });
});

describe('SeparationService com Demucs e FFmpeg reais (CPU)', () => {
  let engineRoot: string;
  let work: string;
  let db: Db;
  let outputDir: string;
  let settings: Settings;
  let input: string | null;
  let events: SeparationProgress[];
  let media: MediaRegistry;
  let service: SeparationService;

  beforeAll(async () => {
    engineRoot = path.dirname(await ensureTestEngine());
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-sep-'));
    db = openDatabase(path.join(work, 'dados'));
    outputDir = path.join(work, 'Saída com acento');
    settings = { outputDir, bitrateKbps: 320, device: 'cpu', pythonPath: '', ffmpegPath: '' };
    input = fixtures.wav;
    events = [];
    media = new MediaRegistry();
    service = new SeparationService({
      paths: enginePaths(engineRoot),
      settings: () => settings,
      history: new HistoryRepository(db),
      media,
      currentInput: () => input,
      onProgress: (p) => events.push(p),
      tmpRoot: work,
    });
  }, 30 * 60_000);

  afterAll(() => {
    db.close();
    fs.rmSync(work, { recursive: true, force: true });
  });

  it(
    'gera exatamente dois MP3 corretos, grava o histórico e não toca no original',
    async () => {
      const before = sha(fixtures.wav);
      const result = await service.run('vocals');
      expect(result.instrumentPath).toBe(path.join(outputDir, 'musica-curta - Voz.mp3'));
      expect(result.restPath).toBe(path.join(outputDir, 'musica-curta - sem Voz.mp3'));
      expect(fs.readdirSync(outputDir).sort()).toEqual([
        'musica-curta - Voz.mp3',
        'musica-curta - sem Voz.mp3',
      ]);
      for (const f of [result.instrumentPath, result.restPath]) {
        const info = probe(f);
        expect(info).toMatchObject({ codec: 'mp3', sampleRate: 44100, channels: 2, bitRate: 320000 });
        expect(info.durationS).toBeGreaterThan(7.5);
      }
      expect(sha(fixtures.wav)).toBe(before);
      expect(media.resolve(result.instrumentUrl)).toBe(result.instrumentPath);
      expect(media.resolve(result.restUrl)).toBe(result.restPath);
      expect(result.device).toBe('cpu');

      const rows = new HistoryRepository(db).list();
      expect(rows[0]).toMatchObject({
        id: result.id,
        sourcePath: fixtures.wav,
        sourceName: 'musica-curta',
        stem: 'vocals',
        device: 'cpu',
        bitrateKbps: 320,
        instrumentOutput: result.instrumentPath,
        restOutput: result.restPath,
        model: 'MelBand-RoFormer Kim FT2 Bleedless',
        processingMs: result.processingMs,
      });
      expect(rows[0]?.audioDurationS).toBeCloseTo(8, 0);

      const percents = events.map((e) => e.percent);
      expect(percents).toEqual([...percents].sort((a, b) => a - b));
      expect(events.at(-1)).toEqual({ phase: 'saving', percent: 100 });
      // Progresso real: além do 3% de início, valores intermediários vindos do tqdm do separador.
      const separating = [...new Set(events.filter((e) => e.phase === 'separating').map((e) => e.percent))];
      expect(separating.filter((p) => p > 3 && p < 85).length).toBeGreaterThanOrEqual(2);
      expect(fs.readdirSync(work).filter((f) => f.startsWith('line-splitter-sep-'))).toEqual([]);
    },
    10 * 60_000,
  );

  it(
    'repetir o mesmo instrumento usa sufixo (2) e respeita o bitrate configurado',
    async () => {
      settings = { ...settings, bitrateKbps: 192 };
      const result = await service.run('vocals');
      expect(path.basename(result.instrumentPath)).toBe('musica-curta - Voz (2).mp3');
      expect(path.basename(result.restPath)).toBe('musica-curta - sem Voz (2).mp3');
      expect(probe(result.instrumentPath).bitRate).toBe(192000);
      settings = { ...settings, bitrateKbps: 320 };
    },
    10 * 60_000,
  );

  it(
    'Guitarra/Violão gera nomes com hífen no lugar da barra',
    async () => {
      const result = await service.run('guitar');
      expect(path.basename(result.instrumentPath)).toBe('musica-curta - Guitarra-Violão.mp3');
      expect(path.basename(result.restPath)).toBe('musica-curta - sem Guitarra-Violão.mp3');
    },
    10 * 60_000,
  );

  it(
    'recusa uma segunda separação simultânea',
    async () => {
      const first = service.run('drums');
      await expect(service.run('bass')).rejects.toMatchObject({
        code: 'CONFLICT',
        message: 'Já existe uma separação em andamento.',
      });
      // Bateria é separada pelo BS-Roformer-SW (DEC-017), registrado no resultado e no histórico.
      const result = await first;
      expect(result.model).toBe('BS-Roformer-SW');
      expect(new HistoryRepository(db).get(result.id)?.model).toBe('BS-Roformer-SW');
    },
    10 * 60_000,
  );

  it('sem arquivo escolhido e sem motor instalado', async () => {
    input = null;
    await expect(service.run('vocals')).rejects.toMatchObject({ code: 'VALIDATION' });
    input = fixtures.wav;
    const noEngine = new SeparationService({
      paths: enginePaths(path.join(work, 'sem-motor')),
      settings: () => settings,
      history: new HistoryRepository(db),
      media,
      currentInput: () => input,
      onProgress: () => undefined,
    });
    await expect(noEngine.run('vocals')).rejects.toMatchObject({ code: 'ENGINE_MISSING' });
  });
});
