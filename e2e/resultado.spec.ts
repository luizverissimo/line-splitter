import fs from 'node:fs';
import path from 'node:path';
import { fixtures } from '../scripts/fixtures.mjs';
import { expect, launchApp, test } from './app';
import { openAppDb } from './db';
import { ensureTestEngine, linkTestEngine } from './engine-fixture';

test.describe('Fluxo completo de separação', () => {
  test('escolher arquivo → Voz → Separar → dois MP3 reais, players e próximos passos', async ({
    userData,
  }) => {
    test.setTimeout(15 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    const outputDir = path.join(userData, 'Saída');
    const { app, page } = await launchApp(userData);
    try {
      // Pasta de saída do teste e diálogos nativos respondidos pelo teste.
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
        const g = globalThis as { __shown?: string[]; __opened?: string[] };
        g.__shown = [];
        g.__opened = [];
        shell.showItemInFolder = (p: string) => void g.__shown?.push(p);
        shell.openPath = (async (p: string) => {
          g.__opened?.push(p);
          return '';
        }) as typeof shell.openPath;
      }, fixtures.wav);

      await page.getByRole('link', { name: 'Início' }).click();
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(
        page.getByLabel('Arquivo escolhido').getByRole('heading', { name: 'musica-curta.wav' }),
      ).toBeVisible();
      const separar = page.getByRole('button', { name: 'Separar' });
      await expect(separar).toBeDisabled();
      await page.getByRole('radio', { name: /Voz/ }).check({ force: true });
      await expect(separar).toBeEnabled();
      await separar.click();

      await expect(page.getByRole('heading', { name: 'Separando: Voz' })).toBeVisible();
      await expect(page.getByText(/Tempo decorrido:/)).toBeVisible();
      const result = page.getByLabel('Resultado da separação');
      await expect(result.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
        timeout: 10 * 60_000,
      });
      await expect(result).toContainText('musica-curta - Voz.mp3');
      await expect(result).toContainText('musica-curta - sem Voz.mp3');
      expect(fs.readdirSync(outputDir).sort()).toEqual([
        'musica-curta - Voz.mp3',
        'musica-curta - sem Voz.mp3',
      ]);

      // Player da faixa do instrumento toca de verdade pelo media://.
      await result.getByRole('button', { name: 'Tocar musica-curta - Voz.mp3' }).click();
      await expect
        .poll(() => page.evaluate(() => document.querySelectorAll('audio')[1]?.currentTime ?? 0), {
          timeout: 10_000,
        })
        .toBeGreaterThan(0.3);
      await result.getByRole('button', { name: 'Pausar musica-curta - Voz.mp3' }).click();

      await result.getByRole('button', { name: 'Mostrar arquivo' }).first().click();
      await result.getByRole('button', { name: 'Abrir pasta' }).click();
      const calls = await app.evaluate(() => {
        const g = globalThis as { __shown?: string[]; __opened?: string[] };
        return { shown: g.__shown, opened: g.__opened };
      });
      expect(calls).toEqual({ shown: [path.join(outputDir, 'musica-curta - Voz.mp3')], opened: [outputDir] });

      await result.getByRole('button', { name: 'Separar outro instrumento' }).click();
      await expect(
        page.getByLabel('Arquivo escolhido').getByRole('heading', { name: 'musica-curta.wav' }),
      ).toBeVisible();
      await expect(page.getByRole('group', { name: 'Qual instrumento você quer separar?' })).toBeVisible();
      await page
        .getByRole('button', { name: 'Novo arquivo' })
        .click()
        .catch(() => undefined);
    } finally {
      await app.close();
    }
    const db = openAppDb(userData);
    try {
      const rows = db
        .prepare('SELECT instrument, instrument_output, rest_output, device FROM separations')
        .all();
      expect(rows).toEqual([
        {
          instrument: 'vocals',
          instrument_output: path.join(outputDir, 'musica-curta - Voz.mp3'),
          rest_output: path.join(outputDir, 'musica-curta - sem Voz.mp3'),
          device: 'cpu',
        },
      ]);
    } finally {
      db.close();
    }
  });
});
