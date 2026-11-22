import fs from 'node:fs';
import path from 'node:path';
import { expect, launchApp, test } from './app';
import { ensureTestEngine, linkTestEngine, seedLargeModels } from './engine-fixture';

const DEMUCS_FILE = '5c90dfd2-34c22ccb.th';
const DOWNLOADED = [
  DEMUCS_FILE,
  'BS-Roformer-SW.yaml',
  'config_mel_band_roformer_kim_ft_unwa.yaml',
  'htdemucs_6s.yaml',
];

test.describe('Download dos modelos pelo app', () => {
  test('baixa das fontes oficiais com progresso e cada modelo fica ✔', async ({ userData }) => {
    test.setTimeout(10 * 60_000);
    const seeded = await seedLargeModels(userData);
    const { app, page } = await launchApp(userData);
    try {
      const items = page.getByRole('list', { name: 'Itens do motor' }).getByRole('listitem');
      await expect(items.nth(3)).toContainText(
        'Modelo MelBand-RoFormer Kim FT2 Bleedless · Voz: com problema',
      );
      await expect(items.nth(3)).toContainText('Download incompleto (870,8 MB); baixe de novo.');
      await expect(items.nth(5)).toContainText('Não baixado (52,4 MB).');
      await page.getByRole('button', { name: 'Baixar modelos' }).click();
      await expect(page.getByText(/^Baixando .+: .* de 52,5 MB$/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Modelos baixados e conferidos (52,5 MB).')).toBeVisible({
        timeout: 5 * 60_000,
      });
      await expect(items.nth(3)).toContainText('Modelo MelBand-RoFormer Kim FT2 Bleedless · Voz: pronto');
      await expect(items.nth(3)).toContainText('Baixado (870,8 MB)');
      await expect(items.nth(4)).toContainText(
        'Modelo BS-Roformer-SW · Bateria, Baixo, Guitarra/Violão, Piano/Teclado: pronto',
      );
      await expect(items.nth(5)).toContainText(
        'Modelo htdemucs_6s · Voz, Bateria, Baixo, Guitarra/Violão, Piano/Teclado: pronto',
      );
      const models = path.join(userData, 'engine', 'models');
      expect(fs.readdirSync(models).sort()).toEqual([...DOWNLOADED, ...seeded].sort());
    } finally {
      await app.close();
    }
  });

  test('cancelar no meio guarda o parcial e "Baixar modelos" continua de onde parou', async ({
    userData,
  }) => {
    test.setTimeout(10 * 60_000);
    await seedLargeModels(userData);
    const models = path.join(userData, 'engine', 'models');
    const partial = path.join(models, `${DEMUCS_FILE}.parcial`);
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('button', { name: 'Baixar modelos' }).click();
      await expect(page.getByText(/^Baixando htdemucs_6s: /)).toBeVisible({ timeout: 60_000 });
      await expect.poll(() => (fs.existsSync(partial) ? fs.statSync(partial).size : 0)).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Cancelar download' }).click();
      await expect(
        page.getByText('Download dos modelos cancelado. O que já foi baixado é aproveitado na próxima vez.'),
      ).toBeVisible();
      const kept = fs.statSync(partial).size;
      expect(kept).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(models, DEMUCS_FILE))).toBe(false);
      await page.getByRole('button', { name: 'Baixar modelos' }).click();
      // Só o que faltava é transferido: o total mostrado é menor que os 52,4 MB do arquivo.
      await expect(
        page.getByText(/^Modelos baixados e conferidos \((?!52,4 MB)[\d,]+ (KB|MB)\)\.$/),
      ).toBeVisible({
        timeout: 5 * 60_000,
      });
      expect(fs.statSync(path.join(models, DEMUCS_FILE)).size).toBe(54_996_327);
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
