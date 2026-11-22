import type { Settings } from '@line-splitter/shared';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { engineHandlers } from '../handlers/engine';
import { openDatabase } from '../db/database';
import { SettingsRepository } from '../settings/repository';
import {
  detectEngine,
  detectFfmpeg,
  detectPython,
  detectSeparator,
  parseVersion,
  resolveDevice,
} from './detect';
import { findInPath } from './exec';
import { ensureTestEngine } from '../../../../../e2e/engine-fixture';
import { enginePaths } from './paths';
import { EngineInstaller } from './install';
import { ModelDownloader } from './model';

// Requisitos do ambiente de desenvolvimento (README): Python ≥ 3.9 e FFmpeg no PATH.
let tmp: string;
beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-engine-'));
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const settings = (over: Partial<Settings> = {}): Settings => ({
  outputDir: path.join(tmp, 'saida'),
  bitrateKbps: 320,
  device: 'auto',
  pythonPath: '',
  ffmpegPath: '',
  ...over,
});
const posix = process.platform !== 'win32';

describe('utilitários', () => {
  it('parseVersion', () => {
    expect(parseVersion('Python 3.12.3')).toEqual([3, 12, 3]);
    expect(parseVersion('3.9')).toEqual([3, 9, 0]);
    expect(parseVersion('sem versão')).toBeNull();
  });

  it('findInPath respeita o PATH informado', () => {
    const bin = path.join(tmp, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    expect(findInPath(['ffmpeg'], { PATH: bin })).toBeNull();
    expect(findInPath(['ffmpeg'], process.env)).not.toBeNull();
  });

  it('enginePaths no Linux e no Windows', () => {
    expect(enginePaths('/dados', 'linux').venvPython).toBe(
      path.join('/dados', 'engine', 'venv', 'bin', 'python'),
    );
    expect(enginePaths('/dados', 'win32').venvPython).toBe(
      path.join('/dados', 'engine', 'venv', 'Scripts', 'python.exe'),
    );
    expect(enginePaths('/dados').modelsDir).toBe(path.join('/dados', 'engine', 'models'));
  });
});

describe('Python', () => {
  it('encontra o Python do sistema e informa a versão', async () => {
    const r = await detectPython('');
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/^Python 3\.\d+\.\d+$/);
    expect(r.path).toBeTruthy();
  });

  it('caminho configurado inexistente', async () => {
    const missing = path.join(tmp, 'python-inexistente');
    expect(await detectPython(missing)).toEqual({
      ok: false,
      path: missing,
      detail: `Python não encontrado em ${missing}.`,
    });
  });

  it('caminho configurado válido', async () => {
    const real = fs.realpathSync((await detectPython('')).path as string);
    const r = await detectPython(real);
    expect(r).toMatchObject({ ok: true, path: real });
    expect(r.detail).toMatch(/^Python 3\.\d+\.\d+$/);
  });

  it.runIf(posix)('Python antigo é recusado', async () => {
    const old = path.join(tmp, 'python-antigo');
    fs.writeFileSync(old, '#!/bin/sh\necho 3.8.10\n', { mode: 0o755 });
    const r = await detectPython(old);
    expect(r.ok).toBe(false);
    expect(r.detail).toBe(
      'Python 3.8.10 encontrado; o motor (PyTorch 2.6 e audio-separator) precisa do Python 3.10 a 3.13.',
    );
  });
});

describe('FFmpeg', () => {
  it('encontra FFmpeg e ffprobe no sistema', async () => {
    const r = await detectFfmpeg('');
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/^FFmpeg \S+ · ffprobe \S+$/);
    expect(r.ffprobePath).toMatch(/ffprobe(\.exe)?$/);
  });

  it.runIf(posix)('caminho configurado válido usa o ffprobe da mesma pasta', async () => {
    const system = await detectFfmpeg('');
    const dir = path.join(tmp, 'ffmpeg-portatil');
    fs.mkdirSync(dir, { recursive: true });
    fs.symlinkSync(fs.realpathSync(system.path as string), path.join(dir, 'ffmpeg'));
    fs.symlinkSync(fs.realpathSync(system.ffprobePath as string), path.join(dir, 'ffprobe'));
    const r = await detectFfmpeg(path.join(dir, 'ffmpeg'));
    expect(r).toMatchObject({
      ok: true,
      path: path.join(dir, 'ffmpeg'),
      ffprobePath: path.join(dir, 'ffprobe'),
    });
    expect(r.detail).toMatch(/^FFmpeg \S+ · ffprobe \S+$/);
  });

  it.runIf(posix)('ffprobe quebrado ao lado do FFmpeg configurado marca ✖', async () => {
    const system = await detectFfmpeg('');
    for (const [name, content, mode] of [
      ['ffprobe-sem-permissao', 'x', 0o644],
      ['ffprobe-que-falha', '#!/bin/sh\nexit 1\n', 0o755],
    ] as const) {
      const dir = path.join(tmp, name);
      fs.mkdirSync(dir, { recursive: true });
      fs.symlinkSync(fs.realpathSync(system.path as string), path.join(dir, 'ffmpeg'));
      fs.writeFileSync(path.join(dir, 'ffprobe'), content, { mode });
      const r = await detectFfmpeg(path.join(dir, 'ffmpeg'));
      expect(r.ok).toBe(false);
      expect(r.ffprobePath).toBe(path.join(dir, 'ffprobe'));
      expect(r.detail).toMatch(/o ffprobe em .* não executa/);
    }
  });

  it('caminho configurado inexistente ou que não é FFmpeg', async () => {
    const missing = path.join(tmp, 'ffmpeg-x');
    expect((await detectFfmpeg(missing)).detail).toBe(`FFmpeg não encontrado em ${missing}.`);
    const notFfmpeg = await detectFfmpeg(process.execPath);
    expect(notFfmpeg.ok).toBe(false);
    expect(notFfmpeg.detail).toMatch(/^Não foi possível executar/);
  });
});

describe('separador do motor', () => {
  it('sem ambiente do motor', async () => {
    const r = await detectSeparator(enginePaths(path.join(tmp, 'vazio')));
    expect(r).toEqual({
      ok: false,
      torch: null,
      detail: 'Motor não instalado (ambiente Python do app ausente).',
    });
  });

  it.runIf(posix)('resposta inesperada da sonda é recusada', async () => {
    const paths = enginePaths(path.join(tmp, 'sonda-estranha'));
    fs.mkdirSync(path.dirname(paths.venvPython), { recursive: true });
    fs.writeFileSync(
      paths.venvPython,
      '#!/bin/sh\necho \'{"separator":"0.48.0","torch":"2.6.0","cuda":"sim","gpu":null}\'\n',
      { mode: 0o755 },
    );
    expect(await detectSeparator(paths)).toEqual({
      ok: false,
      torch: null,
      detail: 'Resposta inesperada ao verificar o separador.',
    });
  });

  it('motor antigo ou incompleto (venv real sem o audio-separator): explica que é preciso instalar/atualizar', async () => {
    const userData = path.join(tmp, 'venv-sem-separador');
    const paths = enginePaths(userData);
    const python = (await detectPython('')).path as string;
    const created = spawnSync(python, ['-m', 'venv', '--without-pip', paths.venvDir], { encoding: 'utf8' });
    expect({ status: created.status, stderr: created.stderr }).toMatchObject({ status: 0 });
    expect(await detectSeparator(paths)).toEqual({
      ok: false,
      torch: null,
      detail:
        'O separador (audio-separator) não está instalado no ambiente do motor. Clique em "Instalar motor" para instalar ou atualizar.',
    });
  });

  it(
    'o motor de teste real (instalado pelo instalador do app) passa na sonda',
    async () => {
      const engine = await ensureTestEngine();
      const r = await detectSeparator(enginePaths(path.dirname(engine)));
      expect(r.ok).toBe(true);
      expect(r.detail).toMatch(/^audio-separator 0\.48\.0 · PyTorch 2\.6\.0/);
    },
    60 * 60_000,
  );
});

describe('dispositivo', () => {
  const withGpu = { separator: '0.48.0', torch: '2.6.0', cuda: true, gpu: 'RTX 3050' };
  const noGpu = { ...withGpu, cuda: false, gpu: null };

  it('automático usa GPU quando há CUDA, senão CPU', () => {
    expect(resolveDevice('auto', withGpu)).toMatchObject({
      effective: 'cuda',
      gpuName: 'RTX 3050',
      warning: null,
    });
    expect(resolveDevice('auto', noGpu)).toMatchObject({ effective: 'cpu', warning: null });
  });

  it('CPU forçada e GPU pedida sem CUDA', () => {
    expect(resolveDevice('cpu', withGpu)).toMatchObject({ effective: 'cpu', cudaAvailable: true });
    expect(resolveDevice('cuda', noGpu).warning).toMatch(/indisponível/);
    expect(resolveDevice('cuda', null)).toMatchObject({ effective: 'cpu', cudaAvailable: false });
  });
});

describe('detectEngine e canal engine:status', () => {
  it('com Python e FFmpeg do sistema e sem motor instalado', async () => {
    const paths = enginePaths(path.join(tmp, 'completo'));
    const status = await detectEngine(settings(), paths);
    expect(status.python.ok).toBe(true);
    expect(status.ffmpeg.ok).toBe(true);
    expect(status.separator.ok).toBe(false);
    expect(status.models.map((m) => m.ok)).toEqual([false, false]);
    expect(status.model.ok).toBe(false);
    expect(status.ready).toBe(false);
    expect(status.engineDir).toBe(paths.engineDir);
  });

  it('caminho configurado inválido marca o item com ✖ via IPC', async () => {
    const userData = path.join(tmp, 'ipc');
    const db = openDatabase(userData);
    try {
      const repo = new SettingsRepository(db, settings());
      repo.update({ pythonPath: path.join(tmp, 'nao-tem-python') });
      const h = engineHandlers(
        repo,
        enginePaths(userData),
        new EngineInstaller(enginePaths(userData), { step: () => undefined, log: () => undefined }),
        new ModelDownloader(enginePaths(userData), () => undefined),
      );
      const res = await h['engine:status'](undefined);
      expect(res).toMatchObject({
        ok: true,
        data: {
          python: { ok: false, detail: expect.stringContaining('Python não encontrado em') },
          ready: false,
        },
      });
    } finally {
      db.close();
    }
  });
});
