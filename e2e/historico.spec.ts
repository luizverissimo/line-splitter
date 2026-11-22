import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fixtures } from '../scripts/fixtures.mjs';
import { expect, launchApp, test } from './app';
import { openAppDb } from './db';
import { ensureTestEngine, linkTestEngine } from './engine-fixture';

const sha = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

test.describe('Histórico (motor real)', () => {
  test('separação aparece no histórico; ouvir, arquivo apagado fora do app e remover', async ({
    userData,
  }) => {
    test.setTimeout(15 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    const outputDir = path.join(userData, 'Saída');
    const input = path.join(userData, 'Minha Música.wav');
    fs.copyFileSync(fixtures.wav, input);
    const originalHash = sha(input);
    const { app, page } = await launchApp(userData);
    try {
      // Antes de qualquer separação: estado vazio.
      await page.getByRole('link', { name: 'Histórico' }).click();
      await expect(page.getByRole('heading', { name: 'Nenhuma separação ainda' })).toBeVisible();

      await page.getByRole('link', { name: 'Configurações' }).click();
      await page.getByLabel('Pasta de saída').fill(outputDir);
      await page.getByLabel('Dispositivo de processamento').selectOption('cpu');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
      await app.evaluate(({ dialog, shell }, f) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [f],
        })) as typeof dialog.showOpenDialog;
        const g = globalThis as { __opened?: string[] };
        g.__opened = [];
        shell.openPath = (async (p: string) => {
          g.__opened?.push(p);
          return '';
        }) as typeof shell.openPath;
      }, input);

      await page.getByRole('link', { name: 'Início' }).click();
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await page.locator('label.selectable-card', { hasText: 'Canto e falas' }).click();
      await page.getByRole('button', { name: 'Separar' }).click();
      await expect(page.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
        timeout: 10 * 60_000,
      });

      await page.getByRole('link', { name: 'Histórico' }).click();
      const list = page.getByRole('list', { name: 'Separações' });
      const entry = list.getByRole('listitem').first();
      await expect(entry).toContainText('Minha Música · Voz');
      await expect(entry).toContainText(`Original: ${input}`);
      await expect(entry).toContainText(/processado em \d+:\d{2} \(CPU, 320 kbps\)/);
      await expect(entry).toContainText(path.join(outputDir, 'Minha Música - Voz.mp3'));

      // Ouvir a faixa do instrumento direto do histórico.
      const player = entry.getByRole('group', { name: 'Player: Minha Música - Voz.mp3' });
      await player.getByRole('button', { name: 'Tocar Minha Música - Voz.mp3' }).click();
      await expect
        .poll(() => player.locator('audio').evaluate((a: HTMLAudioElement) => a.currentTime), {
          timeout: 10_000,
        })
        .toBeGreaterThan(0.3);
      await player.getByRole('button', { name: 'Pausar Minha Música - Voz.mp3' }).click();

      await entry.getByRole('button', { name: 'Abrir pasta' }).click();
      await expect
        .poll(() => app.evaluate(() => (globalThis as { __opened?: string[] }).__opened))
        .toEqual([outputDir]);

      // Baixar MP3 direto do histórico: o "Salvar como" nativo responde com um destino do teste.
      const downloads = path.join(userData, 'Baixados');
      fs.mkdirSync(downloads);
      await app.evaluate(
        ({ dialog }, dest) => {
          dialog.showSaveDialog = (async () => ({
            canceled: false,
            filePath: dest,
          })) as typeof dialog.showSaveDialog;
        },
        path.join(downloads, 'sem voz.mp3'),
      );
      await entry.getByRole('button', { name: 'Baixar MP3: Sem Voz' }).click();
      await expect(entry.getByRole('status')).toHaveText(`Salvo em ${path.join(downloads, 'sem voz.mp3')}`);
      expect(sha(path.join(downloads, 'sem voz.mp3'))).toBe(
        sha(path.join(outputDir, 'Minha Música - sem Voz.mp3')),
      );

      // Um arquivo apagado fora do app aparece como não encontrado ao reabrir a tela.
      fs.rmSync(path.join(outputDir, 'Minha Música - sem Voz.mp3'));
      await page.getByRole('link', { name: 'Início' }).click();
      await page.getByRole('link', { name: 'Histórico' }).click();
      await expect(entry.getByText('Arquivo não encontrado')).toBeVisible();
      await expect(entry.getByRole('group', { name: 'Player: Minha Música - sem Voz.mp3' })).toHaveCount(0);
      await expect(entry.getByRole('button', { name: 'Baixar MP3: Sem Voz' })).toHaveCount(0);

      // Remover apagando os MP3: some da lista e do disco; o original fica.
      await entry.getByRole('button', { name: 'Remover' }).click();
      const dialog = page.getByRole('dialog', { name: 'Remover do histórico?' });
      await dialog.getByRole('checkbox', { name: 'Apagar também os arquivos MP3' }).check();
      await dialog.getByRole('button', { name: 'Remover' }).click();
      await expect(page.getByRole('heading', { name: 'Nenhuma separação ainda' })).toBeVisible();
      expect(fs.readdirSync(outputDir)).toEqual([]);
      expect(sha(input)).toBe(originalHash);
    } finally {
      await app.close();
    }
    const db = openAppDb(userData);
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM separations').get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });
});
