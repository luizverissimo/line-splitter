import fs from 'node:fs';
import path from 'node:path';
import { expect, launchApp, test } from './app';
import { ensureTestEngine, linkTestEngine } from './engine-fixture';

const MODEL_FILE = '5c90dfd2-34c22ccb.th';

test.describe('Download do modelo pelo app', () => {
  test('baixa do servidor oficial com progresso e o item do modelo fica ✔', async ({ userData }) => {
    test.setTimeout(5 * 60_000);
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('button', { name: 'Baixar modelo' }).click();
      await expect(page.getByText(/Baixando o modelo: .* de 52,4 MB/)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText('Modelo baixado e conferido (52,4 MB).')).toBeVisible({
        timeout: 4 * 60_000,
      });
      const modelItem = page.getByRole('list', { name: 'Itens do motor' }).getByRole('listitem').nth(3);
      await expect(modelItem).toContainText('Modelo htdemucs_6s: pronto');
      await expect(modelItem).toContainText('Modelo htdemucs_6s (52 MB)');
      const models = path.join(userData, 'engine', 'models');
      expect(fs.readdirSync(models).sort()).toEqual([MODEL_FILE, 'htdemucs_6s.yaml']);
    } finally {
      await app.close();
    }
  });

  test('cancelar no meio não deixa arquivo parcial', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('button', { name: 'Baixar modelo' }).click();
      await expect(page.getByText(/Baixando o modelo: /)).toBeVisible({ timeout: 60_000 });
      await page.getByRole('button', { name: 'Cancelar download' }).click();
      await expect(page.getByText('Download do modelo cancelado.')).toBeVisible();
      const models = path.join(userData, 'engine', 'models');
      expect(fs.existsSync(models) ? fs.readdirSync(models) : []).toEqual([]);
      await expect(page.getByRole('button', { name: 'Baixar modelo' })).toBeEnabled();
    } finally {
      await app.close();
    }
  });

  test('com motor e modelo prontos tudo fica ✔ e o app abre no Início, sem rede', async ({ userData }) => {
    test.setTimeout(10 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    // Com tudo pronto o app não baixa nada: os arquivos do modelo não podem mudar.
    const modelFile = path.join(userData, 'engine', 'models', MODEL_FILE);
    const before = fs.statSync(modelFile).mtimeMs;
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
    expect(fs.statSync(modelFile).mtimeMs).toBe(before);
  });
});
