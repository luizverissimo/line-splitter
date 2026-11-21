import { expect, launchApp, test } from './app';

test('o renderer não consegue fazer requisições para a internet', async ({ userData }) => {
  const { app, page } = await launchApp(userData);
  try {
    await expect(page.locator('footer')).toContainText('Line Splitter');
    // O bloqueio do processo principal vale mesmo para o que a CSP não cobre (ex.: navegação de iframe).
    const blocked = await app.evaluate(async ({ session }) => {
      const results: string[] = [];
      for (const url of ['https://example.com/', 'http://1.1.1.1/', 'https://fonts.googleapis.com/css']) {
        try {
          await session.defaultSession.fetch(url);
          results.push(`${url} ok`);
        } catch {
          results.push(`${url} bloqueado`);
        }
      }
      return results;
    });
    expect(blocked).toEqual([
      'https://example.com/ bloqueado',
      'http://1.1.1.1/ bloqueado',
      'https://fonts.googleapis.com/css bloqueado',
    ]);
    const fromPage = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/');
        return 'ok';
      } catch {
        return 'bloqueado';
      }
    });
    expect(fromPage).toBe('bloqueado');
    // O próprio app continua funcionando.
    await page.getByRole('link', { name: 'Configurações' }).click();
    await expect(page.getByLabel('Pasta de saída')).toBeVisible();
  } finally {
    await app.close();
  }
});
