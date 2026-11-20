import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { HistoryRepository } from '../history/repository';
import { shellHandlers } from './shell';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-shell-'));
const db = openDatabase(path.join(dir, 'dados'));
afterAll(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const out = path.join(dir, 'Saída');
fs.mkdirSync(out);
const instrument = path.join(out, 'm - Voz.mp3');
const rest = path.join(out, 'm - sem Voz.mp3');
fs.writeFileSync(instrument, 'x');
fs.writeFileSync(rest, 'x');
new HistoryRepository(db).insert({
  sourcePath: path.join(dir, 'm.wav'),
  sourceName: 'm',
  stem: 'vocals',
  audioDurationS: 8,
  processingMs: 1000,
  device: 'cpu',
  bitrateKbps: 320,
  instrumentOutput: instrument,
  restOutput: rest,
});

// O gerenciador de arquivos do sistema não abre durante o teste: registramos o que seria pedido a ele.
function recorder() {
  const calls: { open: string[]; show: string[] } = { open: [], show: [] };
  return {
    calls,
    fm: {
      openPath: async (p: string) => {
        calls.open.push(p);
        return '';
      },
      showItemInFolder: (p: string) => void calls.show.push(p),
    },
  };
}

describe('abrir pasta / mostrar arquivo', () => {
  it('abre a pasta e mostra o arquivo de uma saída registrada', async () => {
    const { calls, fm } = recorder();
    const h = shellHandlers(new HistoryRepository(db), fm);
    await expect(h['shell:openFolder']({ path: instrument })).resolves.toEqual({
      ok: true,
      data: { opened: true },
    });
    await expect(h['shell:showFile']({ path: rest })).resolves.toEqual({ ok: true, data: { shown: true } });
    expect(calls).toEqual({ open: [out], show: [rest] });
  });

  it('recusa caminhos que não são saídas registradas, inclusive com ../', async () => {
    const { calls, fm } = recorder();
    const h = shellHandlers(new HistoryRepository(db), fm);
    for (const p of [
      '/etc/passwd',
      path.join(dir, 'm.wav'),
      path.join(out, '..', 'dados', 'line-splitter.db'),
      'relativo.mp3',
    ]) {
      await expect(h['shell:showFile']({ path: p })).resolves.toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN_PATH' },
      });
      await expect(h['shell:openFolder']({ path: p })).resolves.toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN_PATH' },
      });
    }
    expect(calls).toEqual({ open: [], show: [] });
  });

  it('arquivo registrado mas apagado do disco dá erro claro', async () => {
    const { fm } = recorder();
    fs.rmSync(rest);
    const h = shellHandlers(new HistoryRepository(db), fm);
    await expect(h['shell:showFile']({ path: rest })).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Arquivo não encontrado. Ele pode ter sido movido ou apagado.' },
    });
  });

  it('falha do sistema ao abrir a pasta vira erro legível', async () => {
    const h = shellHandlers(new HistoryRepository(db), {
      openPath: async () => 'No application is registered as handling this file',
      showItemInFolder: () => undefined,
    });
    await expect(h['shell:openFolder']({ path: instrument })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'IO',
        message: 'Não foi possível abrir a pasta.',
        details: expect.stringContaining('No application'),
      },
    });
  });
});
