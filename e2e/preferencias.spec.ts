import { expect, launchApp, test } from './app';
import { openAppDb } from './db';

test('preferência alterada pela UI sobrevive ao reinício e está no SQLite', async ({ userData }) => {
  const first = await launchApp(userData);
  try {
    await first.page.getByRole('link', { name: 'Configurações' }).click();
    await expect(first.page.getByLabel('Qualidade do MP3')).toHaveValue('320');
    await first.page.getByLabel('Qualidade do MP3').selectOption('192');
    await first.page.getByRole('button', { name: 'Salvar configurações' }).click();
    await expect(first.page.getByText('Configurações salvas.')).toBeVisible();
  } finally {
    await first.app.close();
  }

  const second = await launchApp(userData);
  try {
    await second.page.getByRole('link', { name: 'Configurações' }).click();
    await expect(second.page.getByLabel('Qualidade do MP3')).toHaveValue('192');
  } finally {
    await second.app.close();
  }

  const db = openAppDb(userData);
  try {
    expect(db.prepare('SELECT value FROM settings WHERE key = ?').get('bitrateKbps')).toEqual({
      value: '192',
    });
  } finally {
    db.close();
  }
});
