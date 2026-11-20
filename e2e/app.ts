import { _electron, test as base, expect, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const desktopDir = path.resolve(import.meta.dirname, '../apps/desktop');
const electronBinary = require(path.join(desktopDir, 'node_modules/electron')) as string;
const { devElectronArgs } = (await import(path.join(desktopDir, 'scripts/sandbox.mjs'))) as {
  devElectronArgs: (binary: string) => string[];
};

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userData: string;
}

/** Pasta de dados isolada por teste. */
export function makeUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ls-e2e-'));
}

/** Abre o app empacotado (out/ + web/dist) com uma pasta de dados própria. */
export async function launchApp(userData: string): Promise<LaunchedApp> {
  const app = await _electron.launch({
    executablePath: electronBinary,
    args: [...devElectronArgs(electronBinary), desktopDir],
    env: { ...process.env, LINE_SPLITTER_USER_DATA: userData, LINE_SPLITTER_DEV_URL: '' },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, userData };
}

/** `test` com uma pasta de dados temporária criada antes e apagada depois de cada teste. */
export const test = base.extend<{ userData: string }>({
  userData: async ({}, use) => {
    const dir = makeUserData();
    await use(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  },
});
export { expect };
