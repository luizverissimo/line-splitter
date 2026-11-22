import type { SeparationProgress, Settings } from '@line-splitter/shared';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestEngine } from '../../../../../e2e/engine-fixture';
import { fixtures } from '../../../../../scripts/fixtures.mjs';
import { openDatabase, type Db } from '../db/database';
import { enginePaths, type EnginePaths } from '../engine/paths';
import { HistoryRepository } from '../history/repository';
import { MediaRegistry } from '../media/registry';
import { explainEngineFailure } from './errors';
import { SeparationService } from './service';

describe('explainEngineFailure', () => {
  it('traduz as falhas conhecidas', () => {
    expect(explainEngineFailure('torch.OutOfMemoryError: CUDA out of memory. Tried to allocate')).toMatch(
      /Memória da GPU/,
    );
    expect(explainEngineFailure("RuntimeError: DefaultCPUAllocator: can't allocate memory")).toMatch(
      /Memória RAM/,
    );
    expect(explainEngineFailure('Could not load file /x.wav')).toMatch(/não conseguiu ler este arquivo/);
    expect(explainEngineFailure("ModuleNotFoundError: No module named 'audio_separator'")).toMatch(
      /Reinstale o motor/,
    );
    expect(explainEngineFailure('python terminou com SIGKILL')).toMatch(/encerrado inesperadamente/);
    expect(
      explainEngineFailure(
        'RuntimeError: PytorchStreamReader failed reading zip archive: failed finding central directory',
      ),
    ).toMatch(/modelo está corrompido/);
    expect(
      explainEngineFailure(
        'mdxc_separator - Failed to load Roformer model: Cannot use ``weights_only=True`` with files saved in the legacy .tar format.',
      ),
    ).toMatch(/modelo está corrompido/);
    expect(explainEngineFailure('WARNING: pip cache checksum mismatch, refetching wheel')).toMatch(
      /log técnico/,
    );
    expect(explainEngineFailure('???')).toMatch(/log técnico/);
  });
});

describe('cancelamento e falhas com o motor real (CPU)', () => {
  let engine: EnginePaths;
  let work: string;
  let db: Db;
  let outputDir: string;
  let input: string;
  const settings = (): Settings => ({
    outputDir,
    bitrateKbps: 320,
    device: 'cpu',
    pythonPath: '',
    ffmpegPath: '',
  });

  beforeAll(async () => {
    engine = enginePaths(path.dirname(await ensureTestEngine()));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-cancel-'));
    db = openDatabase(path.join(work, 'dados'));
    outputDir = path.join(work, 'saida');
    input = fixtures.wav;
  }, 30 * 60_000);
  afterAll(() => {
    db.close();
    fs.rmSync(work, { recursive: true, force: true });
  });

  function service(paths: EnginePaths, onProgress: (p: SeparationProgress) => void = () => undefined) {
    return new SeparationService({
      paths,
      settings,
      history: new HistoryRepository(db),
      media: new MediaRegistry(),
      currentInput: () => input,
      onProgress,
      tmpRoot: work,
    });
  }
  const temps = () => fs.readdirSync(work).filter((f) => f.startsWith('line-splitter-sep-'));
  const outputs = () => (fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : []);

  const childPid = (svc: SeparationService) =>
    (svc as unknown as { child: { pid?: number } | null }).child?.pid;
  const groupAlive = (pid: number) => {
    try {
      process.kill(-pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  // Grupos de processos (kill -pgid) só existem em Linux/macOS; no Windows o killTree usa taskkill /T.
  const posix = process.platform !== 'win32';

  it.runIf(posix)(
    'cancelar durante a separação encerra a árvore de processos, apaga temporários e não grava nada',
    async () => {
      let s: SeparationService | null = null;
      let pid: number | undefined;
      let cancelledAt = 0;
      const after: SeparationProgress[] = [];
      s = service(engine, (p) => {
        if (cancelledAt) after.push(p);
        if (!cancelledAt && p.phase === 'separating' && p.percent > 0 && s) {
          pid = childPid(s);
          cancelledAt = Date.now();
          s.cancel();
        }
      });
      const run = s.run('vocals');
      run.catch(() => undefined);
      await expect.poll(() => cancelledAt, { timeout: 60_000 }).toBeGreaterThan(0);
      // O separador ainda teria vários segundos de trabalho: o grupo de processos tem de sumir já.
      await expect.poll(() => groupAlive(pid as number), { timeout: 800, interval: 20 }).toBe(false);
      await expect(run).rejects.toMatchObject({
        code: 'CANCELLED',
        message: 'Separação cancelada. Nenhum arquivo foi gerado.',
      });
      const elapsed = Date.now() - cancelledAt;
      expect(outputs()).toEqual([]);
      expect(temps()).toEqual([]);
      expect(new HistoryRepository(db).list()).toEqual([]);
      expect(s.isRunning).toBe(false);
      expect(s.cancel()).toBe(false);
      // Nenhuma fase depois do Cancelar e resposta rápida.
      expect(after).toEqual([]);
      expect(pid).toBeDefined();
      expect(elapsed).toBeLessThan(1500);
    },
    10 * 60_000,
  );

  it.runIf(posix)(
    'cancelar durante a geração dos MP3 (FFmpeg) mata o FFmpeg e não grava nada',
    async () => {
      let s: SeparationService | null = null;
      let ffmpeg: ChildProcess | null = null;
      let waiting = false;
      s = service(engine, (p) => {
        if (!waiting && p.phase === 'encoding' && s) {
          waiting = true;
          const svc = s;
          // A fase muda logo antes de o FFmpeg nascer: espera o processo do FFmpeg existir e cancela.
          const timer = setInterval(() => {
            const current = (svc as unknown as { child: ChildProcess | null }).child;
            if (current && path.basename(current.spawnfile).startsWith('ffmpeg')) {
              clearInterval(timer);
              ffmpeg = current;
              svc.cancel();
            }
          }, 1);
        }
      });
      await expect(s.run('bass')).rejects.toMatchObject({ code: 'CANCELLED' });
      // Foi morto pelo Cancelar (não terminou sozinho).
      expect((ffmpeg as ChildProcess | null)?.signalCode).toBe('SIGKILL');
      expect(outputs()).toEqual([]);
      expect(temps()).toEqual([]);
      expect(new HistoryRepository(db).list()).toEqual([]);
    },
    10 * 60_000,
  );

  it(
    'cancelar logo no início também não deixa rastro',
    async () => {
      const s = service(engine);
      const run = s.run('drums');
      expect(s.cancel()).toBe(true);
      await expect(run).rejects.toMatchObject({ code: 'CANCELLED' });
      expect(outputs()).toEqual([]);
      expect(temps()).toEqual([]);
      expect(new HistoryRepository(db).list()).toEqual([]);
    },
    10 * 60_000,
  );

  it.runIf(process.platform !== 'win32')(
    'processo morto de fora vira erro legível com log técnico',
    async () => {
      const s = service(engine, (p) => {
        if (p.phase === 'separating' && p.percent > 0) {
          // Mata o separador como o sistema faria (OOM killer, por exemplo), sem usar o cancelar do app.
          const child = (s as unknown as { child: { pid?: number } | null }).child;
          if (child?.pid) process.kill(-child.pid, 'SIGKILL');
        }
      });
      const err = await s.run('bass').catch((e: unknown) => e);
      expect(err).toMatchObject({
        code: 'ENGINE_FAILED',
        message: 'O processo de separação foi encerrado inesperadamente.',
      });
      expect((err as { details?: string }).details).toMatch(/SIGKILL/);
      expect(outputs()).toEqual([]);
      expect(new HistoryRepository(db).list()).toEqual([]);
    },
    10 * 60_000,
  );

  it(
    'arquivo trocado por lixo depois de escolhido é recusado antes de chegar ao separador',
    async () => {
      const swapped = path.join(work, 'trocado.wav');
      fs.copyFileSync(fixtures.wav, swapped);
      input = swapped;
      // Depois de escolhido, o arquivo é substituído por lixo: a separação confere de novo e recusa.
      const s = service(engine);
      fs.writeFileSync(swapped, Buffer.alloc(4096, 7));
      const err = await s.run('piano').catch((e: unknown) => e);
      input = fixtures.wav;
      expect(err).toMatchObject({ code: 'INVALID_AUDIO' });
      expect(outputs()).toEqual([]);
    },
    10 * 60_000,
  );

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'entrada que não pode ser lida na conversão: erro legível com o stderr do FFmpeg, sem saída nem histórico',
    async () => {
      const locked = path.join(work, 'sem-leitura.wav');
      fs.copyFileSync(fixtures.wav, locked);
      input = locked;
      // Passa na conferência do app e perde a permissão de leitura logo antes da conversão para o separador.
      const s = service(engine, (p) => {
        if (p.phase === 'preparing' && p.percent === 2) fs.chmodSync(locked, 0o000);
      });
      const err = await s.run('vocals').catch((e: unknown) => e);
      fs.chmodSync(locked, 0o600);
      input = fixtures.wav;
      expect(err).toMatchObject({
        code: 'ENGINE_FAILED',
        message: 'O motor não conseguiu ler este arquivo de áudio. Ele pode estar corrompido.',
      });
      expect((err as { details?: string }).details).toMatch(/Permission denied/);
      expect(outputs()).toEqual([]);
      expect(new HistoryRepository(db).list()).toEqual([]);
    },
    10 * 60_000,
  );

  it('motor incompleto (audio-separator removido do ambiente) é explicado', async () => {
    const broken = enginePaths(path.join(work, 'motor-quebrado'));
    fs.mkdirSync(path.dirname(broken.venvPython), { recursive: true });
    fs.writeFileSync(
      broken.venvPython,
      '#!/bin/sh\necho "ModuleNotFoundError: No module named \'audio_separator\'" >&2\nexit 1\n',
      { mode: 0o755 },
    );
    const s = service(broken);
    await expect(s.run('vocals')).rejects.toMatchObject({
      code: 'ENGINE_MISSING',
      details: expect.stringContaining(
        'O separador (audio-separator) não está instalado no ambiente do motor.',
      ),
    });
  });
});
