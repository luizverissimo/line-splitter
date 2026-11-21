import { ipc, type IpcChannel } from '@line-splitter/shared';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { guardSender } from './ipc';
import { APP_ORIGIN, isAllowedNavigation } from './security';
import { SECURE_WEB_PREFERENCES } from './window';

const mainDir = import.meta.dirname;

describe('revisão de segurança', () => {
  it('janela: isolamento de contexto, sandbox, sem Node e sem webview', () => {
    expect(SECURE_WEB_PREFERENCES).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    });
  });

  it('todo canal do contrato recusa payload inválido antes de chegar ao handler', async () => {
    const invalidPayloads: unknown[] = [{ lixo: true }, 42, 'texto', [1, 2]];
    const channels = Object.keys(ipc.channels) as IpcChannel[];
    expect(channels.length).toBeGreaterThan(10);
    for (const channel of channels) {
      let called = false;
      const handler = ipc.defineHandler(channel, (() => {
        called = true;
        throw new Error('não deveria executar');
      }) as never);
      for (const payload of invalidPayloads) {
        const res = await handler(payload);
        expect({ channel, payload, res }).toMatchObject({
          channel,
          payload,
          res: { ok: false, error: { code: 'VALIDATION' } },
        });
      }
      expect({ channel, called }).toEqual({ channel, called: false });
    }
  });

  it('mensagens de origem não confiável recebem FORBIDDEN sem executar nada', async () => {
    let calls = 0;
    const guarded = guardSender(
      async () => {
        calls += 1;
        return { ok: true, data: null };
      },
      (url) => isAllowedNavigation(url, APP_ORIGIN),
    );
    for (const url of [
      'https://exemplo.com/',
      'file:///tmp/x.html',
      'app://outro/index.html',
      '',
      'data:text/html,oi',
    ]) {
      await expect(guarded(url, undefined)).resolves.toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });
    }
    expect(calls).toBe(0);
    await expect(guarded(`${APP_ORIGIN}/index.html#/historico`, undefined)).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(calls).toBe(1);
  });

  it('processos filhos só com spawn e lista de argumentos, nunca com shell', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) files.push(full);
      }
    };
    walk(mainDir);
    const offenders: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      const importsExec =
        /import\s*\{[^}]*\b(exec|execSync|execFile|execFileSync)\b[^}]*\}\s*from\s*'(node:)?child_process'/.test(
          text,
        );
      if (importsExec || /shell:\s*true/.test(text)) {
        offenders.push(path.relative(mainDir, file));
      }
    }
    expect(offenders).toEqual([]);
    // Qualquer forma de importar child_process (named, namespace, default, require) só nos dois módulos permitidos.
    const usesChildProcess = files.filter((f) =>
      /^import (?!type\b)[^;]*from\s*'(node:)?child_process'|require\(\s*'(node:)?child_process'\s*\)/m.test(
        fs.readFileSync(f, 'utf8'),
      ),
    );
    expect(usesChildProcess.map((f) => path.relative(mainDir, f)).sort()).toEqual([
      'engine/exec.ts',
      'engine/process-tree.ts',
    ]);
    // Toda chamada de spawn declara shell: false.
    const spawnCalls = usesChildProcess.flatMap((f) =>
      [...fs.readFileSync(f, 'utf8').matchAll(/\bspawn\([^;]*?\);/gs)].map((m) => ({
        file: path.relative(mainDir, f),
        call: m[0],
      })),
    );
    expect(spawnCalls.length).toBeGreaterThanOrEqual(3);
    expect(spawnCalls.filter((c) => !/shell:\s*false/.test(c.call))).toEqual([]);
    const spawners = files.filter((f) => /\bspawn(Sync)?\(/.test(fs.readFileSync(f, 'utf8')));
    expect(spawners.map((f) => path.relative(mainDir, f)).sort()).toEqual([
      'engine/exec.ts',
      'engine/process-tree.ts',
    ]);
    const withoutShellFalse = spawners.filter((f) => !/shell:\s*false/.test(fs.readFileSync(f, 'utf8')));
    expect(withoutShellFalse).toEqual([]);
  });
});
