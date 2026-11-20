import fs from 'node:fs';
import path from 'node:path';
import { expect, launchApp, test } from './app';
import { openAppDb } from './db';

test.describe('Configurações', () => {
  test('mostra padrões, escolhe pasta pelo diálogo nativo e salva no banco', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Configurações' }).click();
      const musicDir = await app.evaluate(({ app: a }) => a.getPath('music'));
      await expect(page.getByLabel('Pasta de saída')).toHaveValue(path.join(musicDir, 'Line Splitter'));
      await expect(page.getByLabel('Qualidade do MP3')).toHaveValue('320');
      await expect(page.getByLabel('Dispositivo de processamento')).toHaveValue('auto');

      // O diálogo nativo não é automatizável: o teste responde por ele no processo principal.
      const chosen = path.join(userData, 'Minhas Separações');
      await app.evaluate(({ dialog }, dir) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [dir],
        })) as typeof dialog.showOpenDialog;
      }, chosen);
      await page.getByRole('button', { name: 'Escolher…' }).first().click();
      await expect(page.getByLabel('Pasta de saída')).toHaveValue(chosen);

      await page.getByLabel('Qualidade do MP3').selectOption('256');
      await page.getByLabel('Dispositivo de processamento').selectOption('cpu');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
    } finally {
      await app.close();
    }

    const db = openAppDb(userData);
    try {
      const rows = Object.fromEntries(
        db
          .prepare('SELECT key, value FROM settings')
          .all()
          .map((r) => [r.key, JSON.parse(String(r.value))]),
      );
      expect(rows).toMatchObject({
        outputDir: path.join(userData, 'Minhas Separações'),
        bitrateKbps: 256,
        device: 'cpu',
      });
    } finally {
      db.close();
    }
  });

  test('caminho inválido do Python é recusado pelo processo principal', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Configurações' }).click();
      const missing = path.join(userData, 'python-que-nao-existe');
      expect(fs.existsSync(missing)).toBe(false);
      await page.getByLabel('Caminho do Python').fill(missing);
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByRole('alert')).toContainText('Python: arquivo não encontrado.');
      await expect(page.getByText('Configurações salvas.')).toHaveCount(0);

      await page.getByLabel('Caminho do Python').fill('python3');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('O caminho do Python precisa ser absoluto.')).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
