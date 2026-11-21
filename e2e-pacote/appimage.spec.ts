import { _electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fixtures } from '../scripts/fixtures.mjs';
import { expect, test } from '../e2e/app';
import { openAppDb } from '../e2e/db';
import { ensureTestEngine, linkTestEngine } from '../e2e/engine-fixture';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'apps/desktop/package.json'), 'utf8')) as {
  version: string;
};
const appImage = path.join(root, 'release', `Line-Splitter-${pkg.version}-x86_64.AppImage`);

function readSysctl(name: string): string | null {
  try {
    return fs.readFileSync(`/proc/sys/${name.replaceAll('.', '/')}`, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * Dentro do AppImage o chrome-sandbox nunca é SUID root. Se o AppArmor restringe user namespaces
 * (Ubuntu 24.04+), o Chromium só abre com --no-sandbox — o teste só segue assim se o desenvolvedor
 * optar explicitamente (DEC-008), igual aos E2E.
 */
function sandboxArgs(): string[] {
  const restricted = readSysctl('kernel.apparmor_restrict_unprivileged_userns') === '1';
  const userns = readSysctl('kernel.unprivileged_userns_clone') !== '0';
  if (userns && !restricted) return [];
  if (process.env.LINE_SPLITTER_DEV_NO_SANDBOX !== '1') {
    throw new Error(
      'Este Linux restringe user namespaces (AppArmor) e o AppImage não tem chrome-sandbox SUID. ' +
        'Instale o .deb (que registra um perfil do AppArmor) ou defina LINE_SPLITTER_DEV_NO_SANDBOX=1 ' +
        'para rodar este teste com --no-sandbox.',
    );
  }
  return ['--no-sandbox'];
}

test('AppImage gerado: abre, usa o SQLite nativo, detecta o motor e completa uma separação real', async ({
  userData,
}) => {
  expect(fs.existsSync(appImage), `rode "pnpm dist:linux" antes (${appImage})`).toBe(true);
  linkTestEngine(userData, await ensureTestEngine());

  const app = await _electron.launch({
    executablePath: appImage,
    args: sandboxArgs(),
    env: {
      ...process.env,
      // Sem libfuse2 (padrão no Ubuntu 24.04) o AppImage se extrai e roda sozinho.
      APPIMAGE_EXTRACT_AND_RUN: '1',
      LINE_SPLITTER_USER_DATA: userData,
      LINE_SPLITTER_MUSIC_DIR: path.join(userData, 'Musica'),
      LINE_SPLITTER_DEV_URL: '',
    },
    timeout: 120_000,
  });
  try {
    const page = await app.firstWindow();
    // É o app empacotado: interface lida de resources/renderer e better-sqlite3 fora do asar.
    const info = await app.evaluate(({ app: a }) => ({
      packaged: a.isPackaged,
      resources: process.resourcesPath,
    }));
    expect(info.packaged).toBe(true);
    expect(fs.existsSync(path.join(info.resources, 'renderer', 'index.html'))).toBe(true);
    expect(
      fs.existsSync(
        path.join(info.resources, 'app.asar.unpacked/node_modules/better-sqlite3/prebuilds/linux-x64.node'),
      ),
    ).toBe(true);
    expect(page.url()).toMatch(/^app:\/\/bundle\//);

    // Motor detectado (Python + Demucs + FFmpeg + modelo) → abre no Início.
    await page.getByRole('link', { name: 'Motor' }).click();
    await expect(page.getByText('Tudo pronto para separar.')).toBeVisible({ timeout: 60_000 });

    // Configurações gravadas no SQLite do app empacotado.
    const outputDir = path.join(userData, 'Saída');
    await page.getByRole('link', { name: 'Configurações' }).click();
    await page.getByLabel('Pasta de saída').fill(outputDir);
    await page.getByLabel('Dispositivo de processamento').selectOption('cpu');
    await page.getByRole('button', { name: 'Salvar configurações' }).click();
    await expect(page.getByText('Configurações salvas.')).toBeVisible();

    // Separação real.
    await app.evaluate(({ dialog }, f) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [f],
      })) as typeof dialog.showOpenDialog;
    }, fixtures.wav);
    await page.getByRole('link', { name: 'Início' }).click();
    await page.getByRole('button', { name: 'Escolher arquivo' }).click();
    await page.locator('label.selectable-card', { hasText: 'Canto e falas' }).click();
    await page.getByRole('button', { name: 'Separar' }).click();
    await expect(page.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
      timeout: 10 * 60_000,
    });
    expect(fs.readdirSync(outputDir).sort()).toEqual([
      'musica-curta - Voz.mp3',
      'musica-curta - sem Voz.mp3',
    ]);
    for (const f of fs.readdirSync(outputDir)) {
      const head = fs.readFileSync(path.join(outputDir, f)).subarray(0, 3);
      // MP3 com tag ID3 ou quadro MPEG.
      expect(
        head.toString('latin1') === 'ID3' || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0),
      ).toBe(true);
    }

    // Histórico lido do SQLite.
    await page.getByRole('link', { name: 'Histórico' }).click();
    await expect(page.getByRole('list', { name: 'Separações' }).getByRole('listitem')).toHaveCount(1);
  } finally {
    await app.close();
  }
  const db = openAppDb(userData);
  try {
    expect(db.prepare('SELECT instrument, device FROM separations').all()).toEqual([
      { instrument: 'vocals', device: 'cpu' },
    ]);
  } finally {
    db.close();
  }
});
