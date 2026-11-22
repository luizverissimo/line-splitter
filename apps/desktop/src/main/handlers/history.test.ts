import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type Db } from '../db/database';
import { HistoryRepository, type NewSeparation } from '../history/repository';
import { MediaRegistry } from '../media/registry';
import { historyHandlers } from './history';

let dir: string;
let db: Db;
let repo: HistoryRepository;
let media: MediaRegistry;
let original: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-hist-'));
  db = openDatabase(path.join(dir, 'dados'));
  repo = new HistoryRepository(db);
  media = new MediaRegistry();
  original = path.join(dir, 'Minha Música.flac');
  fs.writeFileSync(original, 'original');
});
afterEach(() => {
  db.close();
  fs.chmodSync(dir, 0o700);
  fs.rmSync(dir, { recursive: true, force: true });
});

function addSeparation(name: string, stem: NewSeparation['stem'] = 'vocals') {
  const instrument = path.join(dir, `${name} - Voz.mp3`);
  const rest = path.join(dir, `${name} - sem Voz.mp3`);
  fs.writeFileSync(instrument, 'mp3-a');
  fs.writeFileSync(rest, 'mp3-b');
  return repo.insert({
    sourcePath: original,
    sourceName: name,
    stem,
    audioDurationS: 212.4,
    processingMs: 95_000,
    device: 'cuda',
    bitrateKbps: 320,
    instrumentOutput: instrument,
    restOutput: rest,
    model: 'BS-Roformer-SW',
  });
}
const sha = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

describe('history:list (SQLite real)', () => {
  it('lista o mais recente primeiro, com todos os campos e URLs para ouvir', async () => {
    const a = addSeparation('Primeira');
    const b = addSeparation('Segunda', 'drums');
    const h = historyHandlers(repo, media);
    const res = await h['history:list'](undefined);
    expect(res.ok).toBe(true);
    const items = (res as { data: { id: number; instrument: { url: string | null; exists: boolean } }[] })
      .data;
    expect(items.map((i) => i.id)).toEqual([b.id, a.id]);
    expect(items[1]).toMatchObject({
      sourcePath: original,
      sourceName: 'Primeira',
      stem: 'vocals',
      audioDurationS: 212.4,
      processingMs: 95_000,
      device: 'cuda',
      bitrateKbps: 320,
      instrument: { path: a.instrumentOutput, exists: true },
      rest: { path: a.restOutput, exists: true },
    });
    expect(media.resolve(items[1]?.instrument.url as string)).toBe(a.instrumentOutput);
  });

  it('arquivo apagado fora do app aparece como não encontrado e sem URL', async () => {
    const a = addSeparation('Sumiu');
    fs.rmSync(a.restOutput);
    const res = (await historyHandlers(repo, media)['history:list'](undefined)) as {
      data: { rest: unknown; instrument: { exists: boolean } }[];
    };
    expect(res.data[0]?.rest).toEqual({ path: a.restOutput, exists: false, url: null });
    expect(res.data[0]?.instrument.exists).toBe(true);
  });

  it('histórico vazio', async () => {
    await expect(historyHandlers(repo, media)['history:list'](undefined)).resolves.toEqual({
      ok: true,
      data: [],
    });
  });
});

describe('history:remove', () => {
  it('sem apagar arquivos: tira só o registro', async () => {
    const a = addSeparation('Fica');
    const res = await historyHandlers(repo, media)['history:remove']({ id: a.id, deleteFiles: false });
    expect(res).toEqual({ ok: true, data: { removed: true, deletedFiles: [] } });
    expect(repo.list()).toEqual([]);
    expect(fs.existsSync(a.instrumentOutput)).toBe(true);
    expect(fs.existsSync(a.restOutput)).toBe(true);
  });

  it('apagando arquivos: apaga só os dois MP3 do item, revoga as URLs e nunca o original', async () => {
    const a = addSeparation('Vai');
    const other = addSeparation('Outro');
    const before = sha(original);
    const h = historyHandlers(repo, media);
    const listed = (await h['history:list'](undefined)) as {
      data: { id: number; instrument: { url: string } }[];
    };
    const url = listed.data.find((i) => i.id === a.id)?.instrument.url as string;
    const res = await h['history:remove']({ id: a.id, deleteFiles: true });
    expect(res).toEqual({
      ok: true,
      data: { removed: true, deletedFiles: [a.instrumentOutput, a.restOutput] },
    });
    expect(fs.existsSync(a.instrumentOutput)).toBe(false);
    expect(fs.existsSync(a.restOutput)).toBe(false);
    expect(sha(original)).toBe(before);
    expect(fs.existsSync(other.instrumentOutput)).toBe(true);
    expect(media.resolve(url)).toBeNull();
    expect(repo.list().map((r) => r.id)).toEqual([other.id]);
  });

  it('remover sem apagar deixa de servir os MP3 pelo media:// (listar várias vezes não acumula usos)', async () => {
    const a = addSeparation('Lista');
    const h = historyHandlers(repo, media);
    await h['history:list'](undefined);
    const listed = (await h['history:list'](undefined)) as { data: { instrument: { url: string } }[] };
    const url = listed.data[0]?.instrument.url as string;
    await h['history:remove']({ id: a.id, deleteFiles: false });
    expect(media.resolve(url)).toBeNull();
    expect(fs.existsSync(a.instrumentOutput)).toBe(true);
  });

  it('item inexistente e entrada inválida', async () => {
    const h = historyHandlers(repo, media);
    await expect(h['history:remove']({ id: 999, deleteFiles: false })).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    await expect(h['history:remove']({ id: -1, deleteFiles: true })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
  });

  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'erro ao apagar mantém o registro e explica',
    async () => {
      const a = addSeparation('Travado');
      fs.chmodSync(dir, 0o500);
      const res = await historyHandlers(repo, media)['history:remove']({ id: a.id, deleteFiles: true });
      fs.chmodSync(dir, 0o700);
      expect(res).toMatchObject({
        ok: false,
        error: { code: 'IO', message: expect.stringContaining('continua no histórico') },
      });
      expect(repo.list().map((r) => r.id)).toEqual([a.id]);
    },
  );
});
