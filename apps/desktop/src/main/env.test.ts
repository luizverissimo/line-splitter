import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveDevUrl, resolveMusicDirOverride, resolveUserDataOverride } from './env';

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('resolveMusicDirOverride', () => {
  it('sem variável devolve null; com caminho absoluto cria e devolve', () => {
    expect(resolveMusicDirOverride({})).toBeNull();
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-music-'));
    tmpDirs.push(base);
    const target = path.join(base, 'Musica');
    expect(resolveMusicDirOverride({ LINE_SPLITTER_MUSIC_DIR: target })).toBe(target);
    expect(fs.statSync(target).isDirectory()).toBe(true);
  });

  it('recusa caminho relativo com mensagem clara', () => {
    expect(() => resolveMusicDirOverride({ LINE_SPLITTER_MUSIC_DIR: 'Musica' })).toThrow(
      /LINE_SPLITTER_MUSIC_DIR precisa ser um caminho absoluto/,
    );
  });
});

describe('resolveUserDataOverride', () => {
  it('sem variável devolve null', () => {
    expect(resolveUserDataOverride({})).toBeNull();
    expect(resolveUserDataOverride({ LINE_SPLITTER_USER_DATA: '  ' })).toBeNull();
  });

  it('cria a pasta absoluta e a devolve', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-env-'));
    tmpDirs.push(base);
    const target = path.join(base, 'dados', 'app');
    expect(resolveUserDataOverride({ LINE_SPLITTER_USER_DATA: target })).toBe(target);
    expect(fs.statSync(target).isDirectory()).toBe(true);
  });

  it('recusa caminho relativo', () => {
    expect(() => resolveUserDataOverride({ LINE_SPLITTER_USER_DATA: 'dados' })).toThrow(/caminho absoluto/);
  });

  it('recusa pasta sem permissão de escrita', () => {
    if (process.getuid?.() === 0) return;
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-env-'));
    tmpDirs.push(base);
    fs.chmodSync(base, 0o500);
    try {
      expect(() => resolveUserDataOverride({ LINE_SPLITTER_USER_DATA: base })).toThrow(
        /sem permissão de escrita/,
      );
    } finally {
      fs.chmodSync(base, 0o700);
    }
  });
});

describe('resolveDevUrl', () => {
  it('aceita localhost', () => {
    expect(resolveDevUrl({ LINE_SPLITTER_DEV_URL: 'http://localhost:5173' })?.origin).toBe(
      'http://localhost:5173',
    );
    expect(resolveDevUrl({ LINE_SPLITTER_DEV_URL: 'http://127.0.0.1:5173/' })?.port).toBe('5173');
  });

  it('sem variável devolve null', () => {
    expect(resolveDevUrl({})).toBeNull();
  });

  it('recusa host remoto, protocolo estranho e URL inválida', () => {
    expect(() => resolveDevUrl({ LINE_SPLITTER_DEV_URL: 'https://exemplo.com' })).toThrow(/localhost/);
    expect(() => resolveDevUrl({ LINE_SPLITTER_DEV_URL: 'file:///etc/passwd' })).toThrow(/localhost/);
    expect(() => resolveDevUrl({ LINE_SPLITTER_DEV_URL: 'não é url' })).toThrow(/URL válida/);
  });
});
