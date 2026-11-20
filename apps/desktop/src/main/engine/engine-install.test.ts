import { AppError, type InstallLog, type InstallStep } from '@line-splitter/shared';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { detectDemucs, detectPython } from './detect';
import { spawnSync } from 'node:child_process';
import { openDatabase } from '../db/database';
import { engineHandlers } from '../handlers/engine';
import { SettingsRepository } from '../settings/repository';
import { findInPath } from './exec';
import { EngineInstaller, explainInstallFailure, hasNvidiaGpu } from './install';
import { enginePaths } from './paths';

const tmpDirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-install-'));
  tmpDirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

function recorder() {
  const steps: InstallStep[] = [];
  const logs: InstallLog[] = [];
  return {
    steps,
    logs,
    events: { step: (s: InstallStep) => steps.push(s), log: (l: InstallLog) => logs.push(l) },
  };
}

async function systemPython() {
  const py = await detectPython('');
  if (!py.ok || !py.path) throw new Error(`Testes do instalador exigem Python ≥ 3.9 no PATH: ${py.detail}`);
  return py.path;
}

describe('explainInstallFailure', () => {
  it('reconhece falhas comuns', () => {
    expect(explainInstallFailure('... Failed to establish a new connection ...')).toMatch(/Sem conexão/);
    expect(
      explainInstallFailure(
        'The virtual environment was not created successfully because ensurepip is not available',
      ),
    ).toMatch(/python3-venv/);
    expect(explainInstallFailure('OSError: [Errno 28] No space left on device')).toMatch(/espaço em disco/);
    expect(explainInstallFailure('ERROR: No matching distribution found for torch==2.6.0')).toMatch(
      /compatível/,
    );
    expect(
      explainInstallFailure(
        'ERROR: Could not find a version that satisfies the requirement demucs (from versions: none)',
      ),
    ).toMatch(/Sem conexão/);
    expect(explainInstallFailure('outra coisa')).toMatch(/log técnico/);
  });
});

describe('hasNvidiaGpu', () => {
  it('concorda com o nvidia-smi da máquina', async () => {
    const smi = findInPath(['nvidia-smi']);
    const expected = smi ? spawnSync(smi, ['-L'], { encoding: 'utf8' }).status === 0 : false;
    expect(await hasNvidiaGpu()).toBe(expected);
  });
});

describe('canal engine:install', () => {
  it('sem Python válido responde ENGINE_MISSING sem tocar no disco', async () => {
    const userData = tmp();
    const db = openDatabase(userData);
    try {
      const repo = new SettingsRepository(db, {
        outputDir: path.join(userData, 'saida'),
        bitrateKbps: 320,
        device: 'auto',
        pythonPath: '/bin/false',
        ffmpegPath: '',
      });
      const paths = enginePaths(userData);
      const h = engineHandlers(repo, paths, new EngineInstaller(paths, recorder().events));
      await expect(h['engine:install']({ reinstall: true })).resolves.toMatchObject({
        ok: false,
        error: { code: 'ENGINE_MISSING', message: expect.stringContaining('/bin/false') },
      });
      expect(fs.existsSync(paths.venvDir)).toBe(false);
      await expect(h['engine:install']({ reinstall: 'sim' })).resolves.toMatchObject({
        ok: false,
        error: { code: 'VALIDATION' },
      });
      await expect(h['engine:cancelInstall'](undefined)).resolves.toEqual({
        ok: true,
        data: { cancelled: false },
      });
    } finally {
      db.close();
    }
  });
});

describe('EngineInstaller (pip e venv reais)', () => {
  it('pasta do motor impossível de criar dá erro legível e não trava novas tentativas', async () => {
    const userData = path.join(tmp(), 'arquivo-comum');
    fs.writeFileSync(userData, 'não é pasta');
    const installer = new EngineInstaller(enginePaths(userData), recorder().events);
    const opts = { reinstall: true, systemPython: await systemPython(), cuda: false };
    const err = await installer.install(opts).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'ENGINE_FAILED', details: expect.stringMatching(/ENOTDIR|EEXIST/) });
    expect(installer.isRunning).toBe(false);
    await expect(installer.install(opts)).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'log em disco que deixa de ser gravável é avisado e não é citado como completo',
    async () => {
      const paths = enginePaths(tmp());
      const rec = recorder();
      const installer = new EngineInstaller(paths, {
        ...rec.events,
        step: (s) => {
          // Depois de iniciado, o arquivo de log fica somente leitura.
          if (s.step === 1) fs.chmodSync(path.join(paths.engineDir, 'install.log'), 0o444);
        },
      });
      const proxy = 'http://127.0.0.1:9';
      const err = await installer
        .install({
          reinstall: true,
          systemPython: await systemPython(),
          cuda: false,
          extraEnv: { HTTPS_PROXY: proxy, https_proxy: proxy, PIP_RETRIES: '0', PIP_TIMEOUT: '2' },
        })
        .catch((e: unknown) => e);
      const warned = rec.logs.some(
        (l) => l.stream === 'info' && l.line.startsWith('Não foi possível gravar o log'),
      );
      expect(warned).toBe(true);
      expect((err as { details?: string }).details).toContain('Não foi possível gravar o log completo');
      expect((err as { details?: string }).details).not.toContain('Log completo em');
    },
    120_000,
  );

  it(
    'cria o ambiente do zero numa pasta temporária, instala PyTorch (CPU) e Demucs e confere importando o Demucs',
    async () => {
      // O venv é novo a cada execução; só os pacotes baixados ficam no cache do próprio pip (~/.cache/pip).
      const paths = enginePaths(tmp());
      const rec = recorder();
      const installer = new EngineInstaller(paths, rec.events);
      const result = await installer.install({
        reinstall: true,
        systemPython: await systemPython(),
        cuda: false,
      });
      expect(result).toMatchObject({ demucs: '4.1.0', cuda: false });
      expect(result.torch).toMatch(/^2\.6\.0/);
      expect(rec.steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5]);
      expect(rec.steps.every((s) => s.total === 5)).toBe(true);
      expect(rec.logs.length).toBeGreaterThan(3);
      expect((await detectDemucs(paths)).ok).toBe(true);
      expect(installer.isRunning).toBe(false);
      const fullLog = fs.readFileSync(path.join(paths.engineDir, 'install.log'), 'utf8');
      expect(fullLog).toContain('== Instalando o Demucs');
      expect(fullLog.split('\n').length).toBeGreaterThan(rec.logs.length);
    },
    30 * 60_000,
  );

  it('cancelar no meio encerra o pip e apaga o ambiente parcial', async () => {
    const paths = enginePaths(tmp());
    const rec = recorder();
    const installer = new EngineInstaller(paths, {
      ...rec.events,
      step: (s) => {
        rec.steps.push(s);
        if (s.step === 2) setImmediate(() => installer.cancel());
      },
    });
    await expect(
      installer.install({ reinstall: true, systemPython: await systemPython(), cuda: false }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(fs.existsSync(paths.venvDir)).toBe(false);
    expect(rec.steps.map((s) => s.step)).toEqual([1, 2]);
    expect(installer.isRunning).toBe(false);
    expect(installer.cancel()).toBe(false);
  }, 120_000);

  it(
    'cancelar durante a conferência final também apaga o ambiente',
    async () => {
      const paths = enginePaths(tmp());
      const installer = new EngineInstaller(paths, {
        log: () => undefined,
        step: (s) => {
          if (s.step === 5) setImmediate(() => installer.cancel());
        },
      });
      await expect(
        installer.install({ reinstall: true, systemPython: await systemPython(), cuda: false }),
      ).rejects.toMatchObject({ code: 'CANCELLED' });
      expect(fs.existsSync(paths.venvDir)).toBe(false);
    },
    30 * 60_000,
  );

  it('sem acesso ao servidor de pacotes mostra mensagem de rede e log completo', async () => {
    const paths = enginePaths(tmp());
    const installer = new EngineInstaller(paths, recorder().events);
    const err = await installer
      .install({
        reinstall: true,
        systemPython: await systemPython(),
        cuda: false,
        // Proxy inalcançável: toda conexão do pip real falha, como sem internet.
        extraEnv: {
          HTTPS_PROXY: 'http://127.0.0.1:9',
          HTTP_PROXY: 'http://127.0.0.1:9',
          https_proxy: 'http://127.0.0.1:9',
          http_proxy: 'http://127.0.0.1:9',
          NO_PROXY: '',
          no_proxy: '',
          PIP_RETRIES: '1',
          PIP_TIMEOUT: '3',
          PIP_NO_CACHE_DIR: '1',
        },
      })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'ENGINE_FAILED', message: expect.stringMatching(/Sem conexão/) });
    expect((err as { details?: string }).details).toContain(path.join(paths.engineDir, 'install.log'));
    expect((err as { details?: string }).details).toMatch(/proxy|127\.0\.0\.1/i);
  }, 120_000);

  it('recusa duas instalações ao mesmo tempo', async () => {
    const paths = enginePaths(tmp());
    const installer = new EngineInstaller(paths, recorder().events);
    const python = await systemPython();
    const first = installer.install({ reinstall: true, systemPython: python, cuda: false });
    await expect(
      installer.install({ reinstall: true, systemPython: python, cuda: false }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    installer.cancel();
    await expect(first).rejects.toMatchObject({ code: 'CANCELLED' });
  }, 120_000);
});
