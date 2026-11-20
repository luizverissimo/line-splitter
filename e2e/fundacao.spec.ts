import fs from 'node:fs';
import path from 'node:path';
import { migrations } from '../apps/desktop/src/main/db/migrations';
import desktopPkg from '../apps/desktop/package.json' with { type: 'json' };
import { expect, launchApp, test } from './app';
import { openAppDb } from './db';

test.describe('fundação: UI → IPC → main → SQLite', () => {
  test('rodapé mostra dados do IPC real e o banco é criado e migrado', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      const electronVersion = await app.evaluate(() => process.versions.electron);
      const platform = { linux: 'Linux', win32: 'Windows', darwin: 'macOS' }[process.platform as string];
      await expect(page.locator('footer')).toHaveText(
        `Line Splitter ${desktopPkg.version} · ${platform} · Electron ${electronVersion}`,
      );
      await expect(page.getByRole('navigation', { name: 'Navegação principal' })).toBeVisible();
      expect(await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))).toBe(userData);
    } finally {
      await app.close();
    }

    expect(fs.existsSync(path.join(userData, 'line-splitter.db'))).toBe(true);
    const db = openAppDb(userData);
    try {
      expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: migrations.length });
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
        .all()
        .map((r) => r.name);
      expect(tables).toEqual(expect.arrayContaining(['settings', 'separations']));
    } finally {
      db.close();
    }
  });

  test('reiniciar reabre o mesmo banco sem reaplicar migrações e preserva os dados', async ({ userData }) => {
    const first = await launchApp(userData);
    try {
      await expect(first.page.locator('footer')).toContainText('Line Splitter');
    } finally {
      await first.app.close();
    }

    const db = openAppDb(userData);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('e2e-marcador', '"persistido"');
    db.close();

    const second = await launchApp(userData);
    try {
      await expect(second.page.locator('footer')).toContainText('Line Splitter');
    } finally {
      await second.app.close();
    }

    const reopened = openAppDb(userData);
    try {
      expect(reopened.prepare('PRAGMA user_version').get()).toEqual({ user_version: migrations.length });
      expect(reopened.prepare('SELECT value FROM settings WHERE key = ?').get('e2e-marcador')).toEqual({
        value: '"persistido"',
      });
    } finally {
      reopened.close();
    }
  });
});
