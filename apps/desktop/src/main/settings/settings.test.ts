import type { Settings } from '@line-splitter/shared';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../db/database';
import { settingsHandlers } from '../handlers/settings';
import { SettingsRepository } from './repository';
import { checkExecutable, checkOutputDir } from './validate-paths';

let dir: string;
let db: Db;
let defaults: Settings;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-settings-'));
  db = openDatabase(path.join(dir, 'dados'));
  defaults = {
    outputDir: path.join(dir, 'Música', 'Line Splitter'),
    bitrateKbps: 320,
    device: 'auto',
    pythonPath: '',
    ffmpegPath: '',
  };
});
afterEach(() => {
  if (db.open) db.close();
  fs.chmodSync(dir, 0o700);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('SettingsRepository (SQLite real)', () => {
  it('sem nada salvo devolve os padrões', () => {
    expect(new SettingsRepository(db, defaults).get()).toEqual(defaults);
  });

  it('grava parcialmente, persiste e sobrevive a reabrir o banco', () => {
    const repo = new SettingsRepository(db, defaults);
    expect(repo.update({ bitrateKbps: 192, device: 'cpu' })).toEqual({
      ...defaults,
      bitrateKbps: 192,
      device: 'cpu',
    });
    db.close();
    db = openDatabase(path.join(dir, 'dados'));
    expect(new SettingsRepository(db, defaults).get()).toMatchObject({ bitrateKbps: 192, device: 'cpu' });
    const rows = db.prepare('SELECT key, value FROM settings ORDER BY key').all();
    expect(rows).toEqual([
      { key: 'bitrateKbps', value: '192' },
      { key: 'device', value: '"cpu"' },
    ]);
  });

  it('valor salvo inválido ou corrompido volta ao padrão', () => {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('bitrateKbps', '128'), ('device', '{quebrado')",
    ).run();
    expect(new SettingsRepository(db, defaults).get()).toEqual(defaults);
  });

  it('recusa atualização inválida sem gravar nada', () => {
    const repo = new SettingsRepository(db, defaults);
    expect(() => repo.update({ bitrateKbps: 100 as 192 })).toThrow(/192, 256 ou 320/);
    expect(db.prepare('SELECT COUNT(*) AS n FROM settings').get()).toEqual({ n: 0 });
  });
});

describe('validação de caminhos no disco', () => {
  it('pasta de saída: existente gravável, inexistente criável e arquivo', () => {
    expect(checkOutputDir(dir)).toBeNull();
    expect(checkOutputDir(path.join(dir, 'nova', 'sub'))).toBeNull();
    const file = path.join(dir, 'arquivo.txt');
    fs.writeFileSync(file, 'x');
    expect(checkOutputDir(file)).toMatch(/é um arquivo/);
  });

  // Permissões POSIX: não se aplicam ao Windows nem ao root.
  const posixPermissions = process.platform !== 'win32' && process.getuid?.() !== 0;

  it.runIf(posixPermissions)('pasta de saída sem permissão de escrita', () => {
    const locked = path.join(dir, 'travada');
    fs.mkdirSync(locked);
    fs.chmodSync(locked, 0o500);
    expect(checkOutputDir(locked)).toMatch(/Sem permissão/);
    expect(checkOutputDir(path.join(locked, 'filha'))).toMatch(/Não é possível criar/);
    fs.chmodSync(locked, 0o700);
  });

  it.runIf(posixPermissions)('executável sem permissão de execução', () => {
    const plain = path.join(dir, 'texto');
    fs.writeFileSync(plain, 'x', { mode: 0o600 });
    expect(checkExecutable(plain, 'FFmpeg')).toBe('FFmpeg: o arquivo não tem permissão de execução.');
  });

  it('executável: existente, ausente e pasta', () => {
    expect(checkExecutable(process.execPath, 'Python')).toBeNull();
    expect(checkExecutable(path.join(dir, 'nao-existe'), 'Python')).toBe('Python: arquivo não encontrado.');
    expect(checkExecutable(dir, 'FFmpeg')).toBe('FFmpeg: o caminho não é um arquivo.');
  });
});

describe('canais settings:get / settings:update', () => {
  it('valida no main, persiste e devolve o conjunto completo', async () => {
    const h = settingsHandlers(new SettingsRepository(db, defaults));
    await expect(h['settings:get'](undefined)).resolves.toEqual({ ok: true, data: defaults });

    const newDir = path.join(dir, 'Saídas');
    await expect(h['settings:update']({ outputDir: newDir, ffmpegPath: process.execPath })).resolves.toEqual({
      ok: true,
      data: { ...defaults, outputDir: newDir, ffmpegPath: process.execPath },
    });
    await expect(h['settings:get'](undefined)).resolves.toMatchObject({ data: { outputDir: newDir } });
  });

  it('recusa entrada inválida e caminho inexistente com mensagem em português', async () => {
    const h = settingsHandlers(new SettingsRepository(db, defaults));
    await expect(h['settings:update']({ bitrateKbps: 64 })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', message: expect.stringContaining('192, 256 ou 320') },
    });
    await expect(h['settings:update']({ pythonPath: path.join(dir, 'python-inexistente') })).resolves.toEqual(
      {
        ok: false,
        error: { code: 'VALIDATION', message: 'Python: arquivo não encontrado.' },
      },
    );
    await expect(h['settings:update']({})).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });
});
