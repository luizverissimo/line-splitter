import fs from 'node:fs';
import path from 'node:path';
import { fixtures } from '../scripts/fixtures.mjs';
import { expect, launchApp, test } from './app';
import { ensureTestEngine, linkTestEngine } from './engine-fixture';

async function prepare(userData: string, input: string = fixtures.wav) {
  linkTestEngine(userData, await ensureTestEngine());
  const launched = await launchApp(userData);
  const { app, page } = launched;
  await page.getByRole('link', { name: 'Configurações' }).click();
  await page.getByLabel('Pasta de saída').fill(path.join(userData, 'Saída'));
  await page.getByLabel('Dispositivo de processamento').selectOption('cpu');
  await page.getByRole('button', { name: 'Salvar configurações' }).click();
  await expect(page.getByText('Configurações salvas.')).toBeVisible();
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [f],
    })) as typeof dialog.showOpenDialog;
  }, input);
  await page.getByRole('link', { name: 'Início' }).click();
  await page.getByRole('button', { name: 'Escolher arquivo' }).click();
  await expect(page.getByLabel('Arquivo escolhido')).toBeVisible();
  return launched;
}

test.describe('Tela de processamento (motor real)', () => {
  test('progresso real, tempo decorrido e navegação durante o processamento', async ({ userData }) => {
    test.setTimeout(15 * 60_000);
    // Áudio de ~64 s (fixture gerada junto com as outras) para a separação ainda estar rodando na volta.
    const { app, page } = await prepare(userData, fixtures.longMusic);
    try {
      await page.getByRole('radio', { name: /Bateria/ }).check({ force: true });
      await page.getByRole('button', { name: 'Separar' }).click();
      await expect(page.getByRole('heading', { name: 'Separando: Bateria' })).toBeVisible();
      const bar = page.getByRole('progressbar');
      const value = async () => Number((await bar.getAttribute('aria-valuenow')) ?? 0);
      await expect.poll(value, { timeout: 60_000 }).toBeGreaterThan(0);

      // O tempo decorrido muda a cada segundo.
      const elapsed = page.getByText(/Tempo decorrido:/);
      const t1 = await elapsed.textContent();
      await expect.poll(() => elapsed.textContent(), { timeout: 1500, intervals: [100] }).not.toBe(t1);

      // A interface continua respondendo: trocar de tela e voltar mantém a separação e o progresso.
      const before = await value();
      // Medido dentro da página: do clique até o título da nova tela aparecer, com a separação rodando.
      const routeMs = await page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            const start = performance.now();
            const done = () => {
              if (document.querySelector('h1')?.textContent === 'Histórico') {
                observer.disconnect();
                resolve(performance.now() - start);
              }
            };
            const observer = new MutationObserver(done);
            observer.observe(document.body, { subtree: true, childList: true, characterData: true });
            (
              Array.from(document.querySelectorAll('a')).find(
                (a) => a.textContent === 'Histórico',
              ) as HTMLElement
            ).click();
            done();
          }),
      );
      expect(routeMs).toBeLessThan(200);
      await expect(page.getByRole('heading', { level: 1, name: 'Histórico' })).toBeVisible();
      await page.getByRole('link', { name: 'Início' }).click();
      await expect(page.getByRole('heading', { name: 'Separando: Bateria' })).toBeVisible();
      expect(await value()).toBeGreaterThanOrEqual(before);
      await expect.poll(value, { timeout: 60_000 }).toBeGreaterThan(before);
      await expect(page.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
        timeout: 10 * 60_000,
      });
    } finally {
      await app.close();
    }
  });

  test('Cancelar interrompe, não grava nada e volta à escolha do instrumento', async ({ userData }) => {
    test.setTimeout(15 * 60_000);
    const { app, page } = await prepare(userData);
    try {
      await page.getByRole('radio', { name: /Voz/ }).check({ force: true });
      await page.getByRole('button', { name: 'Separar' }).click();
      await expect(page.getByText(/Tempo decorrido:/)).toBeVisible();
      await expect
        .poll(async () => Number((await page.getByRole('progressbar').getAttribute('aria-valuenow')) ?? 0), {
          timeout: 60_000,
        })
        .toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByText('Separação cancelada. Nenhum arquivo foi gerado.')).toBeVisible({
        timeout: 30_000,
      });
      const out = path.join(userData, 'Saída');
      expect(fs.existsSync(out) ? fs.readdirSync(out) : []).toEqual([]);
      await page.getByRole('button', { name: 'Escolher instrumento' }).click();
      await expect(page.getByRole('group', { name: 'Qual instrumento você quer separar?' })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
