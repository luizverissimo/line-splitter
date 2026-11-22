import fs from 'node:fs';
import path from 'node:path';
import { expect, launchApp, test } from './app';
import { ensureTestEngine, linkTestEngine, seedPartialModels } from './engine-fixture';

const VOCALS = 'mel_band_roformer_kim_ft2_bleedless_unwa.ckpt';
const VOCALS_SIZE = 913_101_368;

test.describe('Download dos modelos pelo app', () => {
  test('continua o download do espelho oficial com progresso e cada modelo fica ✔', async ({ userData }) => {
    test.setTimeout(10 * 60_000);
    await seedPartialModels(userData);
    const { app, page } = await launchApp(userData);
    try {
      const items = page.getByRole('list', { name: 'Itens do motor' }).getByRole('listitem');
      await expect(items).toHaveCount(5);
      await expect(items.nth(3)).toContainText(
        'Modelo MelBand-RoFormer Kim FT2 Bleedless · Voz: com problema',
      );
      await expect(items.nth(3)).toContainText('Não baixado (870,8 MB).');
      await expect(items.nth(4)).toContainText('Download incompleto (667,0 MB); baixe de novo.');
      await page.getByRole('button', { name: 'Baixar modelos' }).click();
      // O total é o tamanho completo do que falta; a barra já começa no que estava no parcial.
      await expect(
        page.getByText(/^Baixando MelBand-RoFormer Kim FT2 Bleedless: 8\d\d,\d MB de 870,8 MB$/),
      ).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText(/^Modelos baixados e conferidos \(4\d,\d MB\)\.$/)).toBeVisible({
        timeout: 5 * 60_000,
      });
      await expect(items.nth(3)).toContainText('Modelo MelBand-RoFormer Kim FT2 Bleedless · Voz: pronto');
      await expect(items.nth(3)).toContainText('Baixado (870,8 MB)');
      await expect(items.nth(4)).toContainText(
        'Modelo BS-Roformer-SW · Bateria, Baixo, Guitarra/Violão, Piano/Teclado: pronto',
      );
      const models = path.join(userData, 'engine', 'models');
      expect(fs.readdirSync(models).sort()).toEqual([
        'BS-Roformer-SW.ckpt',
        'BS-Roformer-SW.yaml',
        'config_mel_band_roformer_kim_ft_unwa.yaml',
        VOCALS,
      ]);
      expect(fs.statSync(path.join(models, VOCALS)).size).toBe(VOCALS_SIZE);
    } finally {
      await app.close();
    }
  });

  test('cancelar no meio guarda o parcial e "Baixar modelos" continua de onde parou', async ({
    userData,
  }) => {
    test.setTimeout(10 * 60_000);
    const partial = await seedPartialModels(userData, 200 * 1024 * 1024);
    const seeded = fs.statSync(partial).size;
    const models = path.join(userData, 'engine', 'models');
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('button', { name: 'Baixar modelos' }).click();
      await expect(page.getByText(/^Baixando MelBand-RoFormer Kim FT2 Bleedless: /)).toBeVisible({
        timeout: 60_000,
      });
      await expect.poll(() => fs.statSync(partial).size, { timeout: 60_000 }).toBeGreaterThan(seeded);
      await page.getByRole('button', { name: 'Cancelar download' }).click();
      await expect(
        page.getByText('Download dos modelos cancelado. O que já foi baixado é aproveitado na próxima vez.'),
      ).toBeVisible();
      const kept = fs.statSync(partial).size;
      expect(kept).toBeGreaterThan(seeded);
      expect(kept).toBeLessThan(VOCALS_SIZE);
      expect(fs.existsSync(path.join(models, VOCALS))).toBe(false);
      await page.getByRole('button', { name: 'Baixar modelos' }).click();
      await expect(page.getByText(/^Modelos baixados e conferidos \(.+\)\.$/)).toBeVisible({
        timeout: 5 * 60_000,
      });
      expect(fs.statSync(path.join(models, VOCALS)).size).toBe(VOCALS_SIZE);
      expect(fs.existsSync(partial)).toBe(false);
    } finally {
      await app.close();
    }
  });

  test('com motor e modelos prontos tudo fica ✔ e o app abre no Início, sem rede', async ({ userData }) => {
    test.setTimeout(10 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    // Com tudo pronto o app não baixa nada: os arquivos dos modelos não podem mudar.
    const modelsDir = path.join(userData, 'engine', 'models');
    const stamp = () =>
      fs.readdirSync(modelsDir).map((f) => [f, fs.statSync(path.join(modelsDir, f)).mtimeMs]);
    const before = stamp();
    const { app, page } = await launchApp(userData);
    try {
      await expect(page.locator('footer')).toContainText('Line Splitter');
      await page.getByRole('link', { name: 'Motor' }).click();
      await expect(page.getByText('Tudo pronto para separar.')).toBeVisible({ timeout: 60_000 });
      await page.getByRole('link', { name: 'Início' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
    } finally {
      await app.close();
    }
    const reopened = await launchApp(userData);
    try {
      await expect(reopened.page.locator('footer')).toContainText('Line Splitter');
      // Dá tempo da verificação do motor responder; com tudo pronto não há redirecionamento.
      await expect(reopened.page.getByRole('heading', { level: 1 })).toHaveText('Início');
      await reopened.page.waitForTimeout(8000);
      await expect(reopened.page.getByRole('heading', { level: 1 })).toHaveText('Início');
    } finally {
      await reopened.app.close();
    }
    expect(stamp()).toEqual(before);
  });
});
