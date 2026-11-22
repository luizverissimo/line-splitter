import fs from 'node:fs';
import path from 'node:path';
import { fixtures } from '../scripts/fixtures.mjs';
import { expect, launchApp, test } from './app';
import { openAppDb } from './db';
import { ensureTestEngine, linkModelsExcept, linkTestEngine } from './engine-fixture';

/** Responde pelo diálogo nativo com o arquivo informado. */
async function answer(app: Awaited<ReturnType<typeof launchApp>>['app'], file: string) {
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [f],
    })) as typeof dialog.showOpenDialog;
  }, file);
}

test.describe('Erros, limites e cancelamento', () => {
  test('corrompido, extensão não aceita e áudio de 31 min mostram o erro certo', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Início' }).click();
      const alert = page.getByRole('alert');

      await answer(app, fixtures.corrupted);
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(alert).toContainText('Arquivo corrompido ou formato não suportado.');

      await answer(app, fixtures.wrongExtension);
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(alert).toContainText(
        'Formato não suportado. Envie um arquivo MP3, WAV, FLAC, M4A/AAC ou OGG.',
      );

      await answer(app, fixtures.tooLong);
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(alert).toContainText('Áudio longo demais (31:00). O limite é 30:00.');

      await answer(app, fixtures.tooLarge);
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(alert).toContainText('Arquivo grande demais (501,0 MB). O limite é 500,0 MB.');
      await expect(page.getByLabel('Arquivo escolhido')).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test('erro do motor exibe mensagem legível e o log técnico, sem gravar nada', async ({ userData }) => {
    test.setTimeout(15 * 60_000);
    // Motor de verdade, mas com os pesos do modelo de voz do tamanho certo e conteúdo errado:
    // o PyTorch não consegue ler o arquivo.
    const realEngine = await ensureTestEngine();
    const engineDir = path.join(userData, 'engine');
    fs.mkdirSync(path.join(engineDir, 'models'), { recursive: true });
    // Os modelos vêm íntegros do motor de teste, menos os pesos do modelo de voz, criados errados aqui.
    await linkModelsExcept(userData, ['mel_band_roformer_kim_ft2_bleedless_unwa.ckpt']);
    fs.symlinkSync(path.join(realEngine, 'venv'), path.join(engineDir, 'venv'), 'dir');
    const weights = path.join(engineDir, 'models', 'mel_band_roformer_kim_ft2_bleedless_unwa.ckpt');
    const fd = fs.openSync(weights, 'w');
    fs.ftruncateSync(fd, 913_101_368);
    fs.closeSync(fd);
    const outputDir = path.join(userData, 'Saída');

    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Configurações' }).click();
      await page.getByLabel('Pasta de saída').fill(outputDir);
      await page.getByLabel('Dispositivo de processamento').selectOption('cpu');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
      await answer(app, fixtures.wav);
      await page.getByRole('link', { name: 'Início' }).click();
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await page.locator('label.selectable-card', { hasText: 'Canto e falas' }).click();
      await page.getByRole('button', { name: 'Separar' }).click();
      const alert = page.getByRole('alert').filter({ hasText: 'A separação falhou' });
      await expect(alert).toBeVisible({ timeout: 5 * 60_000 });
      await expect(alert).toContainText(
        'O arquivo do modelo está corrompido. Baixe os modelos de novo na tela Motor.',
      );
      await alert.getByText('Ver log técnico').click();
      await expect(alert).toContainText(
        /Failed to (load|create) .*(Roformer|roformer)|PytorchStreamReader|legacy \.tar format/,
      );
      expect(fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : []).toEqual([]);

      // Seguindo a instrução: na tela Motor o modelo aparece como não baixado e o download está disponível.
      await page.getByRole('link', { name: 'Motor' }).click();
      await page.getByRole('button', { name: 'Verificar de novo' }).click();
      const model = page
        .getByRole('list', { name: 'Itens do motor' })
        .getByRole('listitem')
        .filter({ hasText: 'Modelo MelBand-RoFormer Kim FT2 Bleedless' });
      await expect(model).toContainText('com problema');
      await expect(page.getByRole('button', { name: 'Baixar modelos' })).toBeEnabled();
    } finally {
      await app.close();
    }
    expect(fs.existsSync(weights)).toBe(false);
    const db = openAppDb(userData);
    try {
      expect(db.prepare('SELECT COUNT(*) AS n FROM separations').get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  test('cancelar no meio não deixa arquivos na saída nem item no histórico', async ({ userData }) => {
    test.setTimeout(15 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    const outputDir = path.join(userData, 'Saída');
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Configurações' }).click();
      await page.getByLabel('Pasta de saída').fill(outputDir);
      await page.getByLabel('Dispositivo de processamento').selectOption('cpu');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
      await answer(app, fixtures.longMusic);
      await page.getByRole('link', { name: 'Início' }).click();
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await page.locator('label.selectable-card', { hasText: 'Linha de baixo' }).click();
      await page.getByRole('button', { name: 'Separar' }).click();
      await expect
        .poll(async () => Number((await page.getByRole('progressbar').getAttribute('aria-valuenow')) ?? 0), {
          timeout: 60_000,
        })
        .toBeGreaterThan(5);
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByText('Separação cancelada. Nenhum arquivo foi gerado.')).toBeVisible({
        timeout: 30_000,
      });
      expect(fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : []).toEqual([]);
      await page.getByRole('link', { name: 'Histórico' }).click();
      await expect(page.getByRole('heading', { name: 'Nenhuma separação ainda' })).toBeVisible();
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

  test('FFmpeg inválido leva à tela Motor com instruções e "Verificar de novo"', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Configurações' }).click();
      await page.getByLabel('Caminho do FFmpeg').fill('/bin/false');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
    } finally {
      await app.close();
    }
    const reopened = await launchApp(userData);
    try {
      const page = reopened.page;
      await expect(page.getByRole('heading', { level: 1, name: 'Motor de separação' })).toBeVisible();
      const ffmpeg = page.getByRole('list', { name: 'Itens do motor' }).getByRole('listitem').nth(1);
      await expect(ffmpeg).toContainText('FFmpeg: com problema');
      await expect(page.getByRole('heading', { name: 'Instalar o FFmpeg no Linux' })).toBeVisible();
      await expect(page.getByText('sudo apt install ffmpeg')).toBeVisible();
      await page.getByRole('button', { name: 'Verificar de novo' }).click();
      await expect(ffmpeg).toContainText('FFmpeg: com problema');
    } finally {
      await reopened.app.close();
    }
  });
});
