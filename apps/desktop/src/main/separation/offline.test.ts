import type { Settings } from '@line-splitter/shared';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestEngine } from '../../../../../e2e/engine-fixture';
import { fixtures } from '../../../../../scripts/fixtures.mjs';
import { probe } from '../../test/audio';
import { openDatabase, type Db } from '../db/database';
import { findInPath } from '../engine/exec';
import { enginePaths, type EnginePaths } from '../engine/paths';
import { HistoryRepository } from '../history/repository';
import { MediaRegistry } from '../media/registry';
import { APP_ORIGIN, isAllowedRendererRequest } from '../security';
import { SeparationService } from './service';

describe('renderer sem rede', () => {
  it('só libera app://, media:// e (em desenvolvimento) o Vite', () => {
    expect(isAllowedRendererRequest(`${APP_ORIGIN}/assets/index.js`, null)).toBe(true);
    expect(isAllowedRendererRequest('media://audio/abc', null)).toBe(true);
    expect(isAllowedRendererRequest('https://example.com/x.js', null)).toBe(false);
    expect(isAllowedRendererRequest('http://localhost:5173/src/main.tsx', null)).toBe(false);
    expect(isAllowedRendererRequest('file:///etc/passwd', null)).toBe(false);
    expect(isAllowedRendererRequest('app://outro/x', null)).toBe(false);
    expect(isAllowedRendererRequest('http://localhost:5173/src/main.tsx', 'http://localhost:5173')).toBe(
      true,
    );
    expect(isAllowedRendererRequest('ws://localhost:5173/', 'http://localhost:5173')).toBe(true);
    expect(isAllowedRendererRequest('http://localhost:8080/', 'http://localhost:5173')).toBe(false);
    expect(isAllowedRendererRequest('https://fonts.googleapis.com/css', 'http://localhost:5173')).toBe(false);
    expect(isAllowedRendererRequest('lixo', null)).toBe(false);
    expect(isAllowedRendererRequest('devtools://devtools/bundled/x.html', null)).toBe(false);
    expect(isAllowedRendererRequest('chrome-extension://abc/x.js', null)).toBe(false);
  });
});

// Isolamento real de rede: o bubblewrap cria um namespace de rede vazio para o processo do motor.
const bwrap = process.platform === 'linux' ? findInPath(['bwrap']) : null;

describe.runIf(bwrap)('separação com a rede do processo do motor bloqueada (bwrap --unshare-net)', () => {
  let work: string;
  let db: Db;
  let offlinePaths: EnginePaths;
  const settings = (): Settings => ({
    outputDir: path.join(work, 'saida'),
    bitrateKbps: 320,
    device: 'cpu',
    pythonPath: '',
    ffmpegPath: '',
  });

  beforeAll(async () => {
    const real = enginePaths(path.dirname(await ensureTestEngine()));
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-offline-'));
    db = openDatabase(path.join(work, 'dados'));
    // Um "python" que roda o Python do motor sem nenhuma interface de rede.
    const wrapper = path.join(work, 'python-sem-rede');
    fs.writeFileSync(
      wrapper,
      `#!/bin/sh\nexec "${bwrap}" --dev-bind / / --unshare-net -- "${real.venvPython}" "$@"\n`,
      {
        mode: 0o755,
      },
    );
    offlinePaths = { ...real, venvPython: wrapper };
  }, 30 * 60_000);
  afterAll(() => {
    db.close();
    fs.rmSync(work, { recursive: true, force: true });
  });

  it('o processo isolado realmente não alcança a rede', () => {
    const r = spawnSync(
      offlinePaths.venvPython,
      ['-c', 'import socket; socket.create_connection(("1.1.1.1", 443), timeout=3)'],
      { encoding: 'utf8' },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/Network is unreachable|OSError/);
  });

  it(
    'separação completa funciona sem rede, com o modelo local',
    async () => {
      const service = new SeparationService({
        paths: offlinePaths,
        settings,
        history: new HistoryRepository(db),
        media: new MediaRegistry(),
        currentInput: () => fixtures.wav,
        onProgress: () => undefined,
        tmpRoot: work,
      });
      const result = await service.run('vocals');
      expect(probe(result.instrumentPath)).toMatchObject({ codec: 'mp3', sampleRate: 44100, channels: 2 });
      expect(probe(result.restPath)).toMatchObject({ codec: 'mp3' });
    },
    10 * 60_000,
  );

  it(
    'sem o modelo, falha com mensagem clara e não tenta baixar',
    async () => {
      const empty = path.join(work, 'motor-sem-modelo');
      const noModel: EnginePaths = { ...offlinePaths, modelsDir: path.join(empty, 'models') };
      const service = new SeparationService({
        paths: noModel,
        settings,
        history: new HistoryRepository(db),
        media: new MediaRegistry(),
        currentInput: () => fixtures.wav,
        onProgress: () => undefined,
        tmpRoot: work,
      });
      await expect(service.run('drums')).rejects.toMatchObject({
        code: 'ENGINE_MISSING',
        message: expect.stringContaining('Os modelos de separação não foram baixados'),
      });
      expect(fs.existsSync(noModel.modelsDir)).toBe(false);
    },
    10 * 60_000,
  );
});
