import path from 'node:path';
import { expect, launchApp, test } from './app';

test('os E2E usam uma pasta de Música própria (nunca a do usuário)', async ({ userData }) => {
  const { app, page } = await launchApp(userData);
  try {
    expect(await app.evaluate(({ app: a }) => a.getPath('music'))).toBe(path.join(userData, 'Musica'));
    await page.getByRole('link', { name: 'Configurações' }).click();
    await expect(page.getByLabel('Pasta de saída')).toHaveValue(
      path.join(userData, 'Musica', 'Line Splitter'),
    );
  } finally {
    await app.close();
  }
});
