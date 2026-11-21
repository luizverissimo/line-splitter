import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkExecutable } from '../settings/validate-paths';
import { detectFfmpeg, detectPython } from './detect';
import { findAllInPath, findInPath } from './exec';
import { killTree, spawnTree, type TreeDeps } from './process-tree';

// Os ramos do Windows dependem só de nomes, extensões e da plataforma informada: dá para exercitá-los
// no Linux com arquivos reais numa pasta temporária. (Executáveis "falsos" aqui são scripts sh reais
// com nome .exe, que o Linux executa de verdade.)
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-win-'));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function dir(name: string): string {
  const d = path.join(root, name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function file(d: string, name: string, content = '', mode = 0o644): string {
  const f = path.join(d, name);
  fs.writeFileSync(f, content, { mode });
  return f;
}
function script(d: string, name: string, body: string): string {
  return file(d, name, `#!/bin/sh\n${body}\n`, 0o755);
}

describe('findInPath no Windows', () => {
  it('usa PATHEXT, aceita a variável "Path" e ignora o bit de execução', () => {
    const a = dir('a');
    const b = dir('b');
    // Sem bit de execução: no Windows não importa. (PATHEXT vem em maiúsculas e o Windows não diferencia.)
    file(a, 'ffmpeg.exe');
    file(b, 'ffmpeg.cmd');
    const env = { Path: `${a};${b}`, PATHEXT: '.COM;.EXE;.CMD' };
    expect(findInPath(['ffmpeg'], env, 'win32')).toBe(path.join(a, 'ffmpeg.exe'));
    expect(findAllInPath(['ffmpeg'], env, 'win32')).toEqual([
      path.join(a, 'ffmpeg.exe'),
      path.join(b, 'ffmpeg.cmd'),
    ]);
  });

  it('sem PATHEXT usa o padrão .EXE;.CMD;.BAT e acha na ordem das pastas', () => {
    const c = dir('c');
    const d = dir('d');
    file(c, 'ffprobe.bat');
    file(d, 'ffprobe.exe');
    expect(findAllInPath(['ffprobe'], { PATH: `${c};${d}` }, 'win32')).toEqual([
      path.join(c, 'ffprobe.bat'),
      path.join(d, 'ffprobe.exe'),
    ]);
  });

  it('no Linux o mesmo arquivo sem bit de execução não serve', () => {
    const e = dir('e');
    file(e, 'ffmpeg');
    expect(findInPath(['ffmpeg'], { PATH: e }, 'linux')).toBeNull();
  });

  it('ignora o atalho da Microsoft Store (…\\Microsoft\\WindowsApps)', () => {
    const store = dir(path.join('Users', 'eu', 'AppData', 'Local', 'Microsoft', 'WindowsApps'));
    const real = dir('Python312');
    file(store, 'python.exe');
    file(real, 'python.exe');
    expect(findAllInPath(['python'], { PATH: `${store};${real}` }, 'win32')).toEqual([
      path.join(real, 'python.exe'),
    ]);
  });
});

describe('detectPython no Windows', () => {
  it('tenta python e depois o lançador py até um funcionar', async () => {
    const broken = dir('py-quebrado');
    const launcher = dir('py-lancador');
    script(broken, 'python.exe', 'echo "falhou ao iniciar" >&2; exit 9');
    script(launcher, 'py.exe', 'echo 3.12.4');
    const r = await detectPython('', { platform: 'win32', env: { PATH: `${broken};${launcher}` } });
    expect(r).toEqual({ ok: true, path: path.join(launcher, 'py.exe'), detail: 'Python 3.12.4' });
  });

  it('nenhum candidato funcionando: explica a falha do primeiro', async () => {
    const only = dir('py-velho');
    script(only, 'python.exe', 'echo 3.8.10');
    const r = await detectPython('', { platform: 'win32', env: { PATH: only } });
    expect(r).toEqual({
      ok: false,
      path: path.join(only, 'python.exe'),
      detail: 'Python 3.8.10 encontrado; o motor (PyTorch 2.6) precisa do Python 3.9 a 3.13.',
    });
  });

  it('sem nenhum Python no PATH (só o atalho da Store)', async () => {
    const store = dir(path.join('Outro', 'Microsoft', 'WindowsApps'));
    script(store, 'python.exe', 'echo 3.12.0');
    const r = await detectPython('', { platform: 'win32', env: { PATH: store } });
    expect(r).toEqual({ ok: false, path: null, detail: 'Python não encontrado no sistema.' });
  });
});

describe('faixa de versões do Python (PyTorch 2.6: 3.9 a 3.13)', () => {
  it('3.13 serve; 3.14 é recusado com a faixa na mensagem', async () => {
    const ok = dir('py313');
    const novo = dir('py314');
    script(ok, 'python3', 'echo 3.13.1');
    script(novo, 'python3', 'echo 3.14.0');
    expect(await detectPython('', { platform: 'linux', env: { PATH: ok } })).toEqual({
      ok: true,
      path: path.join(ok, 'python3'),
      detail: 'Python 3.13.1',
    });
    expect(await detectPython('', { platform: 'linux', env: { PATH: novo } })).toEqual({
      ok: false,
      path: path.join(novo, 'python3'),
      detail: 'Python 3.14.0 encontrado; o motor (PyTorch 2.6) precisa do Python 3.9 a 3.13.',
    });
  });

  it('um 3.14 antes no PATH não impede de usar um 3.12 depois', async () => {
    const novo = dir('py314b');
    const bom = dir('py312');
    script(novo, 'python3', 'echo 3.14.2');
    script(bom, 'python3', 'echo 3.12.8');
    expect(await detectPython('', { platform: 'linux', env: { PATH: `${novo}:${bom}` } })).toEqual({
      ok: true,
      path: path.join(bom, 'python3'),
      detail: 'Python 3.12.8',
    });
  });

  it('Python configurado fora da faixa também é recusado', async () => {
    const d = dir('py-config');
    const py = script(d, 'python-novo', 'echo 3.14.0');
    expect((await detectPython(py)).ok).toBe(false);
  });
});

describe('detectFfmpeg com executáveis .exe', () => {
  it('acha o ffprobe.exe vizinho do ffmpeg.exe configurado', async () => {
    const bin = dir('ffmpeg-win');
    const ffmpeg = script(bin, 'ffmpeg.exe', 'echo "ffmpeg version 7.1-full_build"');
    script(bin, 'ffprobe.exe', 'echo "ffprobe version 7.1-full_build"');
    const r = await detectFfmpeg(ffmpeg);
    expect(r).toMatchObject({ ok: true, path: ffmpeg, ffprobePath: path.join(bin, 'ffprobe.exe') });
  });
});

describe('árvore de processos no Windows', () => {
  function fakeChild(pid: number): ChildProcess & { killed: boolean; killSignals: unknown[] } {
    const child = new EventEmitter() as ChildProcess & { killSignals: unknown[] };
    Object.assign(child, { pid, exitCode: null, signalCode: null, killSignals: [] });
    child.kill = ((signal?: NodeJS.Signals) => {
      child.killSignals.push(signal ?? 'SIGTERM');
      return true;
    }) as ChildProcess['kill'];
    return child as ChildProcess & { killed: boolean; killSignals: unknown[] };
  }
  function winDeps(onSpawn: (cmd: string, args: string[], opts: SpawnOptions) => ChildProcess): TreeDeps {
    return {
      platform: 'win32',
      spawn: onSpawn,
      killGroup: () => {
        throw new Error('grupo de processos não existe no Windows');
      },
    };
  }

  it('cancelar chama taskkill /pid N /T /F, sem shell e sem janela', () => {
    const calls: { cmd: string; args: string[]; opts: SpawnOptions }[] = [];
    const killer = new EventEmitter() as ChildProcess;
    const child = fakeChild(4321);
    killTree(
      child,
      winDeps((cmd, args, opts) => {
        calls.push({ cmd, args, opts });
        return killer;
      }),
    );
    expect(calls).toEqual([
      { cmd: 'taskkill', args: ['/pid', '4321', '/T', '/F'], opts: { windowsHide: true, shell: false } },
    ]);
    expect(child.killSignals).toEqual([]);
  });

  it('taskkill que não inicia (evento error) não derruba o app e encerra o processo direto', () => {
    const killer = new EventEmitter() as ChildProcess;
    const child = fakeChild(99);
    killTree(
      child,
      winDeps(() => killer),
    );
    expect(() => killer.emit('error', new Error('spawn taskkill ENOENT'))).not.toThrow();
    expect(child.killSignals).toEqual(['SIGTERM']);
  });

  it('taskkill que termina com erro (acesso negado) cai no encerramento direto; com sucesso, não', () => {
    const failing = new EventEmitter() as ChildProcess;
    const child = fakeChild(11);
    killTree(
      child,
      winDeps(() => failing),
    );
    failing.emit('exit', 1, null);
    expect(child.killSignals).toEqual(['SIGTERM']);

    const ok = new EventEmitter() as ChildProcess;
    const other = fakeChild(12);
    killTree(
      other,
      winDeps(() => ok),
    );
    ok.emit('exit', 0, null);
    expect(other.killSignals).toEqual([]);
  });

  it('spawn do taskkill que lança na hora também cai no encerramento direto', () => {
    const child = fakeChild(7);
    killTree(
      child,
      winDeps(() => {
        throw new Error('EPERM');
      }),
    );
    expect(child.killSignals).toEqual(['SIGTERM']);
  });

  it('processo que já terminou não é tocado', () => {
    const child = fakeChild(5);
    Object.assign(child, { exitCode: 0 });
    let spawned = false;
    killTree(
      child,
      winDeps(() => {
        spawned = true;
        return new EventEmitter() as ChildProcess;
      }),
    );
    expect(spawned).toBe(false);
  });

  it('spawnTree no Windows não usa grupo destacado; no Linux usa', () => {
    const seen: SpawnOptions[] = [];
    const deps = (platform: NodeJS.Platform): TreeDeps => ({
      platform,
      spawn: (_c, _a, opts) => {
        seen.push(opts);
        return new EventEmitter() as ChildProcess;
      },
      killGroup: () => undefined,
    });
    spawnTree('python.exe', ['-m', 'demucs'], { A: '1' }, deps('win32'));
    spawnTree('python', ['-m', 'demucs'], { A: '1' }, deps('linux'));
    expect(seen).toEqual([
      { shell: false, windowsHide: true, detached: false, env: { A: '1' } },
      { shell: false, windowsHide: true, detached: true, env: { A: '1' } },
    ]);
  });
});

describe('validação de caminho executável no Windows', () => {
  it('no Windows basta existir e ser legível; no Linux precisa do bit de execução', () => {
    const d = dir('valida');
    const exe = file(d, 'python.exe', 'MZ');
    expect(checkExecutable(exe, 'Python', 'win32')).toBeNull();
    expect(checkExecutable(exe, 'Python', 'linux')).toBe('Python: o arquivo não tem permissão de execução.');
    expect(checkExecutable(path.join(d, 'nao-existe.exe'), 'Python', 'win32')).toBe(
      'Python: arquivo não encontrado.',
    );
    expect(checkExecutable(d, 'Python', 'win32')).toBe('Python: o caminho não é um arquivo.');
  });
});
