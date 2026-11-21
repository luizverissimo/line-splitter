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

      // Player da faixa do instrumento: metadados carregados pelo media://, duração correta e toca de verdade.
      const player = result.getByRole('group', { name: 'Player: musica-curta - Voz.mp3' });
      const audio = player.locator('audio');
      await expect
        .poll(() => audio.evaluate((a: HTMLAudioElement) => a.readyState), { timeout: 10_000 })
        .toBeGreaterThanOrEqual(1);
      expect(await audio.evaluate((a: HTMLAudioElement) => a.duration)).toBeCloseTo(8, 0);
      await expect(player).toContainText('0:08');
      // Barra de posição e volume também agem no áudio de verdade.
      await player.getByRole('slider', { name: 'Posição em musica-curta - Voz.mp3' }).fill('4');
      await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeCloseTo(4, 0);
      await player.getByRole('slider', { name: 'Volume de musica-curta - Voz.mp3' }).fill('0.5');
      await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.volume)).toBeCloseTo(0.5, 2);
      await player.getByRole('button', { name: 'Tocar musica-curta - Voz.mp3' }).click();
      await expect
        .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime), { timeout: 10_000 })
        .toBeGreaterThan(4.3);
      await result.getByRole('button', { name: 'Pausar musica-curta - Voz.mp3' }).click();

      await result.getByRole('button', { name: 'Mostrar arquivo' }).first().click();
      await result.getByRole('button', { name: 'Abrir pasta' }).click();
      await expect
        .poll(() =>
          app.evaluate(() => {
            const g = globalThis as { __shown?: string[]; __opened?: string[] };
            return { shown: g.__shown, opened: g.__opened };
          }),
        )
        .toEqual({ shown: [path.join(outputDir, 'musica-curta - Voz.mp3')], opened: [outputDir] });

      await result.getByRole('button', { name: 'Separar outro instrumento' }).click();
      await expect(
        page.getByLabel('Arquivo escolhido').getByRole('heading', { name: 'musica-curta.wav' }),
      ).toBeVisible();
      await expect(page.getByRole('group', { name: 'Qual instrumento você quer separar?' })).toBeVisible();
      // O mesmo arquivo, outro instrumento; depois "Novo arquivo" volta ao Início limpo.
      await page.locator('label.selectable-card', { hasText: 'Linha de baixo' }).click();
      await expect(page.getByRole('radio', { name: /Baixo/ })).toBeChecked();
      await page.getByRole('button', { name: 'Separar' }).click();
      await expect(result.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
        timeout: 10 * 60_000,
      });
      await expect(result).toContainText('musica-curta - Baixo.mp3');
      await result.getByRole('button', { name: 'Novo arquivo' }).click();
      await expect(page.getByText('Nenhum arquivo escolhido')).toBeVisible();
      await expect(page.getByLabel('Arquivo escolhido')).toHaveCount(0);
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
        {
          instrument: 'bass',
          instrument_output: path.join(outputDir, 'musica-curta - Baixo.mp3'),
          rest_output: path.join(outputDir, 'musica-curta - sem Baixo.mp3'),
          device: 'cpu',
        },
      ]);
    } finally {
      db.close();
    }
  });
});
