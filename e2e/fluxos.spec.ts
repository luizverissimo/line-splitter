import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fixtures } from '../scripts/fixtures.mjs';
import { expect, launchApp, test } from './app';
import { openAppDb } from './db';
import { ensureTestEngine, linkTestEngine } from './engine-fixture';

const INSTRUMENTS = [
  { card: 'Canto e falas', title: 'Voz', file: 'Voz' },
  { card: 'Bateria e percussão', title: 'Bateria', file: 'Bateria' },
  { card: 'Linha de baixo', title: 'Baixo', file: 'Baixo' },
  { card: 'Guitarras e violões', title: 'Guitarra/Violão', file: 'Guitarra-Violão' },
  { card: 'Piano e teclados', title: 'Piano/Teclado', file: 'Piano-Teclado' },
];

function ffprobe(file: string) {
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '-select_streams', 'a:0', file],
    { encoding: 'utf8' },
  );
  expect(r.status, r.stderr).toBe(0);
  const data = JSON.parse(r.stdout) as {
    format: { duration: string; bit_rate: string };
    streams: { codec_name: string; sample_rate: string; channels: number }[];
  };
  return {
    codec: data.streams[0]?.codec_name,
    sampleRate: Number(data.streams[0]?.sample_rate),
    channels: data.streams[0]?.channels,
    durationS: Number(data.format.duration),
    bitRate: Number(data.format.bit_rate),
  };
}

test.describe('Todos os fluxos felizes (motor real)', () => {
  test('os 5 instrumentos geram 2 MP3 válidos cada; progresso até 100%; histórico com remover sem apagar', async ({
    userData,
  }) => {
    test.setTimeout(30 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    const outputDir = path.join(userData, 'Saída');
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Configurações' }).click();
      await page.getByLabel('Pasta de saída').fill(outputDir);
      await page.getByLabel('Dispositivo de processamento').selectOption('cpu');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [f],
        })) as typeof dialog.showOpenDialog;
      }, fixtures.wav);

      await page.getByRole('link', { name: 'Início' }).click();
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(page.getByLabel('Arquivo escolhido')).toContainText('musica-curta.wav');

      // Registra o maior valor que a barra de progresso mostrou e se o tempo decorrido apareceu.
      await page.evaluate(() => {
        const w = window as unknown as { __maxProgress: number; __sawElapsed: boolean };
        w.__maxProgress = 0;
        w.__sawElapsed = false;
        new MutationObserver(() => {
          const bar = document.querySelector('[role="progressbar"]');
          const v = Number(bar?.getAttribute('aria-valuenow') ?? 0);
          if (v > w.__maxProgress) w.__maxProgress = v;
          if (document.body.textContent?.includes('Tempo decorrido')) w.__sawElapsed = true;
        }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      });

      const result = page.getByLabel('Resultado da separação');
      for (const inst of INSTRUMENTS) {
        await page.locator('label.selectable-card', { hasText: inst.card }).click();
        await page.getByRole('button', { name: 'Separar' }).click();
        await expect(result.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
          timeout: 10 * 60_000,
        });
        const instrumentFile = path.join(outputDir, `musica-curta - ${inst.file}.mp3`);
        const restFile = path.join(outputDir, `musica-curta - sem ${inst.file}.mp3`);
        await expect(result).toContainText(path.basename(instrumentFile));
        await expect(result).toContainText(path.basename(restFile));
        for (const f of [instrumentFile, restFile]) {
          const info = ffprobe(f);
          expect(info, f).toMatchObject({ codec: 'mp3', sampleRate: 44100, channels: 2 });
          expect(info.durationS, f).toBeGreaterThan(7.5);
          // 320 kbps (padrão do PRD §5.5); o contêiner soma alguns bytes de cabeçalho.
          expect(Math.abs(info.bitRate - 320_000), f).toBeLessThan(8_000);
        }
        await result.getByRole('button', { name: 'Separar outro instrumento' }).click();
      }
      expect(fs.readdirSync(outputDir)).toHaveLength(10);
      const seen = await page.evaluate(() => {
        const w = window as unknown as { __maxProgress: number; __sawElapsed: boolean };
        return { max: w.__maxProgress, elapsed: w.__sawElapsed };
      });
      expect(seen).toEqual({ max: 100, elapsed: true });

      // Histórico: as 5 separações, a mais recente primeiro.
      await page.getByRole('link', { name: 'Histórico' }).click();
      const items = page.getByRole('list', { name: 'Separações' }).getByRole('listitem');
      await expect(items).toHaveCount(5);
      await expect(items.nth(0)).toContainText('musica-curta · Piano/Teclado');
      await expect(items.nth(4)).toContainText('musica-curta · Voz');

      // Remover sem apagar os arquivos: some da lista, os MP3 ficam.
      await items.nth(0).getByRole('button', { name: 'Remover' }).click();
      const dialog = page.getByRole('dialog', { name: 'Remover do histórico?' });
      await expect(dialog.getByRole('checkbox', { name: 'Apagar também os arquivos MP3' })).not.toBeChecked();
      await dialog.getByRole('button', { name: 'Remover' }).click();
      await expect(items).toHaveCount(4);
      expect(fs.existsSync(path.join(outputDir, 'musica-curta - Piano-Teclado.mp3'))).toBe(true);
      expect(fs.readdirSync(outputDir)).toHaveLength(10);
    } finally {
      await app.close();
    }
    const db = openAppDb(userData);
    try {
      expect(
        db
          .prepare('SELECT instrument FROM separations ORDER BY id')
          .all()
          .map((r) => r.instrument),
      ).toEqual(['vocals', 'drums', 'bass', 'guitar']);
    } finally {
      db.close();
    }
  });
});
