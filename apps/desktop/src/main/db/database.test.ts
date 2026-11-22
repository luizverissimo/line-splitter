import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DB_FILENAME, migrate, openDatabase, type Db } from './database';
import { migrations } from './migrations';

const dirs: string[] = [];
const dbs: Db[] = [];
function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-db-'));
  dirs.push(dir);
  return dir;
}
function open(dir: string) {
  const db = openDatabase(dir);
  dbs.push(db);
  return db;
}
afterEach(() => {
  for (const db of dbs.splice(0)) if (db.open) db.close();
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const tables = (db: Db) =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((r) => r.name);

const sampleSeparation = {
  source_path: '/home/u/Música/minha música.flac',
  source_name: 'minha música',
  instrument: 'vocals',
  audio_duration_s: 212.4,
  processing_ms: 95_000,
  device: 'cuda',
  bitrate_kbps: 320,
  instrument_output: '/home/u/Música/Line Splitter/minha música - Voz.mp3',
  rest_output: '/home/u/Música/Line Splitter/minha música - sem Voz.mp3',
};

describe('banco SQLite', () => {
  it('cria o arquivo e migra do zero', () => {
    const dir = tmpDir();
    const db = open(dir);
    expect(fs.existsSync(path.join(dir, DB_FILENAME))).toBe(true);
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length);
    expect(tables(db)).toEqual(expect.arrayContaining(['separations', 'settings']));
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('migração é idempotente ao reabrir e preserva os dados', () => {
    const dir = tmpDir();
    const first = openDatabase(dir);
    first.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('bitrate', '256');
    first.close();

    const second = open(dir);
    expect(migrate(second)).toBe(migrations.length);
    expect(second.prepare('SELECT value FROM settings WHERE key = ?').get('bitrate')).toEqual({
      value: '256',
    });
  });

  it('grava e lê separações com acentos e valores padrão', () => {
    const db = open(tmpDir());
    const insert = db.prepare(`
      INSERT INTO separations (source_path, source_name, instrument, audio_duration_s, processing_ms, device,
        bitrate_kbps, instrument_output, rest_output)
      VALUES (@source_path, @source_name, @instrument, @audio_duration_s, @processing_ms, @device,
        @bitrate_kbps, @instrument_output, @rest_output)`);
    const { lastInsertRowid } = insert.run(sampleSeparation);
    const row = db.prepare('SELECT * FROM separations WHERE id = ?').get(lastInsertRowid) as Record<
      string,
      unknown
    >;
    expect(row).toMatchObject(sampleSeparation);
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('rejeita valores fora das regras (instrumento, bitrate, dispositivo)', () => {
    const db = open(tmpDir());
    const insert = db.prepare(`
      INSERT INTO separations (source_path, source_name, instrument, audio_duration_s, processing_ms, device,
        bitrate_kbps, instrument_output, rest_output)
      VALUES (@source_path, @source_name, @instrument, @audio_duration_s, @processing_ms, @device,
        @bitrate_kbps, @instrument_output, @rest_output)`);
    expect(() => insert.run({ ...sampleSeparation, instrument: 'flauta' })).toThrow(/CHECK/);
    expect(() => insert.run({ ...sampleSeparation, bitrate_kbps: 128 })).toThrow(/CHECK/);
    expect(() => insert.run({ ...sampleSeparation, device: 'tpu' })).toThrow(/CHECK/);
  });

  it('migração 2: separações antigas ficam registradas com o modelo htdemucs_6s', () => {
    const dir = tmpDir();
    fs.mkdirSync(dir, { recursive: true });
    const raw = new Database(path.join(dir, DB_FILENAME));
    migrate(raw, migrations.slice(0, 1));
    raw
      .prepare(
        `INSERT INTO separations (source_path, source_name, instrument, audio_duration_s, processing_ms, device,
           bitrate_kbps, instrument_output, rest_output) VALUES ('/a.wav', 'a', 'vocals', 8, 1000, 'cpu', 320, '/i.mp3', '/r.mp3')`,
      )
      .run();
    expect(migrate(raw, migrations)).toBe(2);
    expect(raw.prepare('SELECT model FROM separations').get()).toEqual({ model: 'htdemucs_6s' });
    raw.close();
  });

  it('recusa banco de versão mais nova que o app', () => {
    const dir = tmpDir();
    const db = openDatabase(dir);
    db.pragma(`user_version = ${migrations.length + 1}`);
    db.close();
    expect(() => openDatabase(dir)).toThrow(/mais nova que este aplicativo/);
  });

  it('desfaz a migração inteira se ela falhar no meio', () => {
    const db = open(tmpDir());
    const broken = [
      ...migrations,
      {
        version: migrations.length + 1,
        name: 'quebrada',
        sql: 'CREATE TABLE ok_1 (a TEXT); CREATE TABLE ( ;',
      },
    ];
    expect(() => migrate(db, broken)).toThrow();
    expect(tables(db)).not.toContain('ok_1');
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.length);
  });
});
