import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { HistoryRepository } from '../history/repository';
import { fileHandlers, type AskSavePath } from './files';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-files-'));
const db = openDatabase(path.join(dir, 'dados'));
afterAll(() => {
  db.close();
  fs.chmodSync(locked, 0o755);
  fs.rmSync(dir, { recursive: true, force: true });
});

const out = path.join(dir, 'Saída');
const downloads = path.join(dir, 'Downloads');
const locked = path.join(dir, 'Trancada');
fs.mkdirSync(out);
fs.mkdirSync(downloads);
fs.mkdirSync(locked);
fs.chmodSync(locked, 0o555);
const instrument = path.join(out, 'Minha Música - Voz.mp3');
const rest = path.join(out, 'Minha Música - sem Voz.mp3');
const gone = path.join(out, 'Apagada - Voz.mp3');
const instrumentBytes = Buffer.from([0xff, 0xfb, 0x90, 0x44, 1, 2, 3]);
fs.writeFileSync(instrument, instrumentBytes);
fs.writeFileSync(rest, Buffer.from([0xff, 0xfb, 0x90, 0x44, 9, 9]));
const repo = new HistoryRepository(db);
for (const [i, r] of [
  [instrument, rest],
  [gone, path.join(out, 'Apagada - sem Voz.mp3')],
] as const) {
  repo.insert({
    sourcePath: path.join(dir, 'm.wav'),
    sourceName: 'm',
    stem: 'vocals',
    audioDurationS: 8,
    processingMs: 1000,
    device: 'cpu',
    bitrateKbps: 320,
    instrumentOutput: i,
    restOutput: r,
    model: 'BS-Roformer-SW',
  });
}

/** O diálogo nativo não abre no teste: responde com o caminho dado e registra o nome sugerido. */
function answering(answer: string | null) {
  const asked: string[] = [];
  const ask: AskSavePath = async (defaultPath) => {
    asked.push(defaultPath);
    return answer;
  };
  return { asked, handlers: fileHandlers(repo, ask, () => downloads) };
}

describe('Baixar MP3 (file:saveCopy)', () => {
  it('copia a faixa para o destino escolhido, sugerindo o nome na pasta Downloads', async () => {
    const dest = path.join(downloads, 'escolhido.mp3');
    const { asked, handlers } = answering(dest);
    await expect(handlers['file:saveCopy']({ path: instrument })).resolves.toEqual({
      ok: true,
      data: { savedTo: dest },
    });
    expect(asked).toEqual([path.join(downloads, 'Minha Música - Voz.mp3')]);
    expect(fs.readFileSync(dest)).toEqual(instrumentBytes);
    expect(fs.existsSync(instrument)).toBe(true);
    expect(fs.readdirSync(downloads).filter((f) => f.includes('parcial'))).toEqual([]);
  });

  it('a faixa sem o instrumento também é salva', async () => {
    const dest = path.join(downloads, 'Minha Música - sem Voz.mp3');
    const { handlers } = answering(dest);
    await expect(handlers['file:saveCopy']({ path: rest })).resolves.toEqual({
      ok: true,
      data: { savedTo: dest },
    });
    expect(fs.readFileSync(dest)).toEqual(fs.readFileSync(rest));
  });

  it('cancelar o diálogo não grava nada', async () => {
    const before = fs.readdirSync(downloads);
    const { handlers } = answering(null);
    await expect(handlers['file:saveCopy']({ path: instrument })).resolves.toEqual({ ok: true, data: null });
    expect(fs.readdirSync(downloads)).toEqual(before);
  });

  it('recusa arquivos que não são saídas registradas, sem abrir o diálogo', async () => {
    const { asked, handlers } = answering(path.join(downloads, 'x.mp3'));
    for (const p of [
      '/etc/passwd',
      path.join(dir, 'm.wav'),
      path.join(out, '..', 'dados', 'x.mp3'),
      'rel.mp3',
    ]) {
      await expect(handlers['file:saveCopy']({ path: p })).resolves.toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN_PATH' },
      });
    }
    await expect(handlers['file:saveCopy']({ path: '' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'VALIDATION' },
    });
    expect(asked).toEqual([]);
  });

  it('faixa registrada que sumiu do disco dá erro legível', async () => {
    const { asked, handlers } = answering(path.join(downloads, 'x.mp3'));
    await expect(handlers['file:saveCopy']({ path: gone })).resolves.toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Arquivo não encontrado. Ele pode ter sido movido ou apagado.' },
    });
    expect(asked).toEqual([]);
  });

  it('valida o destino: extensão .mp3, pasta existente e com permissão de escrita', async () => {
    const cases: [string, string, string][] = [
      [path.join(downloads, 'faixa.wav'), 'VALIDATION', 'Escolha um nome de arquivo terminado em .mp3.'],
      [path.join(downloads, 'faixa'), 'VALIDATION', 'Escolha um nome de arquivo terminado em .mp3.'],
      ['relativo.mp3', 'VALIDATION', 'Escolha um local válido para salvar.'],
      [path.join(dir, 'não existe', 'f.mp3'), 'NOT_FOUND', 'A pasta de destino não existe.'],
    ];
    if (process.getuid?.() !== 0) {
      cases.push([
        path.join(locked, 'f.mp3'),
        'FORBIDDEN',
        `Sem permissão para gravar em ${locked}. Escolha outra pasta.`,
      ]);
    }
    for (const [dest, code, message] of cases) {
      const { handlers } = answering(dest);
      await expect(handlers['file:saveCopy']({ path: instrument })).resolves.toMatchObject({
        ok: false,
        error: { code, message },
      });
    }
    expect(fs.readdirSync(locked)).toEqual([]);
  });

  it('disco cheio vira mensagem clara e não deixa arquivo pela metade', async () => {
    // /dev/full existe no Linux e devolve ENOSPC em qualquer escrita; usamos uma pasta cujo
    // temporário é um link para ele.
    if (!fs.existsSync('/dev/full')) return;
    const full = path.join(dir, 'Cheia');
    fs.mkdirSync(full);
    const dest = path.join(full, 'f.mp3');
    fs.symlinkSync('/dev/full', path.join(full, `.f.mp3.${process.pid}.parcial`));
    const { handlers } = answering(dest);
    await expect(handlers['file:saveCopy']({ path: instrument })).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'IO',
        message: 'Não há espaço livre no disco de destino. Libere espaço ou escolha outro lugar.',
      },
    });
    expect(fs.existsSync(dest)).toBe(false);
    expect(fs.readdirSync(full)).toEqual([]);
  });
});
