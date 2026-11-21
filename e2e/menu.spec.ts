import fs from 'node:fs';
import path from 'node:path';
import { fixtures } from '../scripts/fixtures.mjs';
import { expect, launchApp, test } from './app';
import { ensureTestEngine, linkTestEngine } from './engine-fixture';

type Item = { label: string; submenu?: Item[] };

test.describe('Identidade e menu nativo', () => {
  test('janela com nome e tamanho mínimo; menu em português com ações reais', async ({ userData }) => {
    const outputDir = path.join(userData, 'Pasta de Saída');
    const { app, page } = await launchApp(userData);
    try {
      expect(await page.title()).toBe('Line Splitter');
      const win = await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        return { title: w?.getTitle(), min: w?.getMinimumSize() };
      });
      expect(win).toEqual({ title: 'Line Splitter', min: [880, 600] });
      expect(await app.evaluate(({ app: a }) => a.getName())).toBe('Line Splitter');

      const menu = await app.evaluate(({ Menu }) => {
        const map = (items: Electron.MenuItem[]): Item[] =>
          items
            .filter((i) => i.type !== 'separator')
            .map((i) => ({
              label: i.label,
              ...(i.submenu ? { submenu: map(i.submenu.items) } : {}),
            }));
        return map(Menu.getApplicationMenu()?.items ?? []);
      });
      expect(menu.map((m) => m.label)).toEqual(['Arquivo', 'Editar', 'Ajuda']);
      expect(menu[0]?.submenu?.map((m) => m.label)).toEqual([
        'Escolher arquivo…',
        'Abrir pasta de saída',
        'Sair',
      ]);
      expect(menu[2]?.submenu?.map((m) => m.label)).toEqual(['Sobre o Line Splitter']);

      await page.getByRole('link', { name: 'Configurações' }).click();
      await page.getByLabel('Pasta de saída').fill(outputDir);
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();

      // Diálogos e gerenciador de arquivos do sistema são respondidos pelo teste no processo principal.
      await app.evaluate(({ dialog, shell }, f) => {
        const g = globalThis as { __opened?: string[]; __about?: string[] };
        g.__opened = [];
        g.__about = [];
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [f],
        })) as typeof dialog.showOpenDialog;
        dialog.showMessageBox = (async (...args: unknown[]) => {
          const opts = args.at(-1) as { message: string };
          g.__about?.push(opts.message);
          return { response: 0, checkboxChecked: false };
        }) as typeof dialog.showMessageBox;
        shell.openPath = (async (p: string) => {
          g.__opened?.push(p);
          return '';
        }) as typeof shell.openPath;
      }, fixtures.mp3);

      const click = (top: string, item: string) =>
        app.evaluate(
          ({ Menu, BrowserWindow }, [t, i]) => {
            const entry = Menu.getApplicationMenu()
              ?.items.find((m) => m.label === t)
              ?.submenu?.items.find((m) => m.label === i);
            entry?.click(undefined, BrowserWindow.getAllWindows()[0], undefined as never);
          },
          [top, item] as const,
        );

      // Arquivo › Escolher arquivo… a partir de outra tela: leva ao Início com o arquivo escolhido.
      await click('Arquivo', 'Escolher arquivo…');
      await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
      await expect(
        page.getByLabel('Arquivo escolhido').getByRole('heading', { name: 'musica-curta.mp3' }),
      ).toBeVisible();

      // Arquivo › Abrir pasta de saída: cria e abre a pasta configurada.
      await click('Arquivo', 'Abrir pasta de saída');
      await expect
        .poll(() => app.evaluate(() => (globalThis as { __opened?: string[] }).__opened))
        .toEqual([outputDir]);
      expect(fs.statSync(outputDir).isDirectory()).toBe(true);

      // Ajuda › Sobre.
      await click('Ajuda', 'Sobre o Line Splitter');
      await expect
        .poll(() => app.evaluate(() => (globalThis as { __about?: string[] }).__about))
        .toEqual([expect.stringMatching(/^Line Splitter \d+\.\d+\.\d+$/)]);
    } finally {
      await app.close();
    }
  });

  test('no tamanho mínimo a interface não quebra em nenhum estado (sem rolagem horizontal)', async ({
    userData,
  }) => {
    test.setTimeout(15 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    const { app, page } = await launchApp(userData);
    const overflow = () =>
      page.evaluate(() => {
        const doc = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        const main = document.querySelector('main');
        return Math.max(doc, main ? main.scrollWidth - main.clientWidth : 0);
      });
    try {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(880, 600));
      for (const link of ['Início', 'Motor', 'Histórico', 'Configurações']) {
        await page.getByRole('link', { name: link }).click();
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        expect(await overflow(), link).toBeLessThanOrEqual(0);
      }
      await page.getByLabel('Pasta de saída').fill(path.join(userData, 'Saída'));
      await page.getByLabel('Dispositivo de processamento').selectOption('cpu');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [f],
        })) as typeof dialog.showOpenDialog;
      }, fixtures.longMusic);

      // Início com arquivo carregado e o seletor de instrumento.
      await page.getByRole('link', { name: 'Início' }).click();
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(page.getByRole('group', { name: 'Qual instrumento você quer separar?' })).toBeVisible();
      expect(await overflow(), 'arquivo carregado').toBeLessThanOrEqual(0);

      // Processamento e resultado.
      await page.locator('label.selectable-card', { hasText: 'Piano e teclados' }).click();
      await page.getByRole('button', { name: 'Separar' }).click();
      await expect(page.getByRole('heading', { name: 'Separando: Piano/Teclado' })).toBeVisible();
      expect(await overflow(), 'processamento').toBeLessThanOrEqual(0);
      await expect(page.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
        timeout: 10 * 60_000,
      });
      expect(await overflow(), 'resultado').toBeLessThanOrEqual(0);

      // Histórico com um item.
      await page.getByRole('link', { name: 'Histórico' }).click();
      await expect(page.getByRole('list', { name: 'Separações' })).toBeVisible();
      expect(await overflow(), 'histórico com item').toBeLessThanOrEqual(0);
    } finally {
      await app.close();
    }
  });
});
