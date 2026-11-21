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
export async function launchApp(userData: string, extraEnv: NodeJS.ProcessEnv = {}): Promise<LaunchedApp> {
  // A pasta de Música (padrão da pasta de saída) também fica dentro da pasta do teste:
  // nenhum E2E pode gravar na pasta real do usuário.
  const xdg = path.join(userData, 'xdg');
  const music = path.join(userData, 'Musica');
  fs.mkdirSync(xdg, { recursive: true });
  fs.mkdirSync(music, { recursive: true });
  fs.writeFileSync(path.join(xdg, 'user-dirs.dirs'), `XDG_MUSIC_DIR="${music}"\n`);
  const app = await _electron.launch({
    executablePath: electronBinary,
    args: [...devElectronArgs(electronBinary), desktopDir],
    env: {
      ...process.env,
      XDG_CONFIG_HOME: xdg,
      LINE_SPLITTER_USER_DATA: userData,
      LINE_SPLITTER_DEV_URL: '',
      ...extraEnv,
    },
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
