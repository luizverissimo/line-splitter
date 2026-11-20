import fs from 'node:fs';
import path from 'node:path';
import { expect, launchApp, test } from './app';

test.describe('Instalação do motor pelo app', () => {
  test('mostra etapas e log ao vivo; cancelar encerra e apaga o ambiente parcial', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await expect(page.getByRole('heading', { level: 1, name: 'Motor de separação' })).toBeVisible();
      await page.getByRole('button', { name: 'Instalar motor' }).click();
      await expect(page.getByText(/Etapa [12] de 5:/)).toBeVisible();
      await expect(page.getByLabel('Log da instalação')).toContainText(
        '== Criando o ambiente Python do motor',
      );
      await expect(page.getByText('Etapa 2 de 5: Atualizando o pip')).toBeVisible({ timeout: 60_000 });
      expect(fs.existsSync(path.join(userData, 'engine', 'venv'))).toBe(true);

      await page.getByRole('button', { name: 'Cancelar instalação' }).click();
      await expect(page.getByText('Instalação cancelada. O ambiente parcial foi removido.')).toBeVisible({
        timeout: 30_000,
      });
      expect(fs.existsSync(path.join(userData, 'engine', 'venv'))).toBe(false);
      await expect(page.getByRole('button', { name: 'Instalar motor' })).toBeEnabled();
    } finally {
      await app.close();
    }
  });

  test('sem acesso à internet mostra mensagem legível e log técnico', async ({ userData }) => {
    const proxy = 'http://127.0.0.1:9';
    const { app, page } = await launchApp(userData, {
      HTTPS_PROXY: proxy,
      HTTP_PROXY: proxy,
      https_proxy: proxy,
      http_proxy: proxy,
      NO_PROXY: '',
      no_proxy: '',
      PIP_RETRIES: '1',
      PIP_TIMEOUT: '3',
      PIP_NO_CACHE_DIR: '1',
    });
    try {
      await page.getByRole('button', { name: 'Instalar motor' }).click();
      await expect(page.getByText('A instalação do motor falhou')).toBeVisible({ timeout: 120_000 });
      await expect(page.getByRole('alert')).toContainText('Sem conexão com a internet');
      await page.getByText('Log técnico').click();
      await expect(page.getByRole('alert')).toContainText(/proxy/i);
    } finally {
      await app.close();
    }
  });
});
