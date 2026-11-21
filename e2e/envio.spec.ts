import type { Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fixtures } from '../scripts/fixtures.mjs';
import { expect, launchApp, test } from './app';

const sha = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** Responde pelo diálogo nativo (não automatizável) com o arquivo informado. */
async function answerDialog(app: Awaited<ReturnType<typeof launchApp>>['app'], file: string) {
  await app.evaluate(({ dialog }, f) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [f],
    })) as typeof dialog.showOpenDialog;
  }, file);
}

/** Solta um arquivo real do disco na área de soltar, como o arrastar do gerenciador de arquivos. */
async function dropFile(
  page: Page,
  file: string,
  target = '[aria-label="Área para soltar o arquivo de áudio"]',
) {
  // Um <input type=file> temporário dá ao Chromium um File ligado ao disco (o mesmo que o arrastar entrega).
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'e2e-arquivo';
    input.style.display = 'none';
    document.body.append(input);
  });
  await page.setInputFiles('#e2e-arquivo', file);
  await page.evaluate((selector) => {
    const input = document.getElementById('e2e-arquivo') as HTMLInputElement;
    const data = new DataTransfer();
    for (const f of Array.from(input.files ?? [])) data.items.add(f);
    const zone = document.querySelector(selector);
    zone?.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
    zone?.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    input.remove();
  }, target);
}

test.describe('Envio do arquivo de áudio', () => {
  test('escolher WAV pelo diálogo mostra metadados reais e o player toca o original', async ({
    userData,
  }) => {
    const before = sha(fixtures.wav);
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Início' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
      await expect(page.getByText('Nenhum arquivo escolhido')).toBeVisible();
      await answerDialog(app, fixtures.wav);
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      const card = page.getByLabel('Arquivo escolhido');
      await expect(card.getByRole('heading', { name: 'musica-curta.wav' })).toBeVisible();
      await expect(card).toContainText('0:08');
      await expect(card).toContainText('WAV · pcm_s16le · 44,1 kHz · estéreo');
      // O player carrega o original pelo protocolo media:// e toca de verdade.
      await expect(card.getByText('0:08').last()).toBeVisible();
      await card.getByRole('button', { name: 'Tocar original: musica-curta.wav' }).click();
      await expect(card.getByRole('button', { name: 'Pausar original: musica-curta.wav' })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.querySelector('audio')?.currentTime ?? 0), {
          timeout: 10_000,
        })
        .toBeGreaterThan(0.3);
      await card.getByRole('button', { name: 'Pausar original: musica-curta.wav' }).click();
    } finally {
      await app.close();
    }
    expect(sha(fixtures.wav)).toBe(before);
  });

  test('soltar fora da caixa, numa outra tela, leva ao Início com o arquivo', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      // Sem motor instalado o app abre na tela Motor; espera essa decisão antes de navegar.
      await expect(page.getByRole('heading', { level: 1, name: 'Motor de separação' })).toBeVisible();
      await page.getByRole('link', { name: 'Configurações' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
      await dropFile(page, fixtures.ogg, 'nav');
      await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
      await expect(
        page.getByLabel('Arquivo escolhido').getByRole('heading', { name: 'musica-curta.ogg' }),
      ).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test('arrastar e soltar um FLAC funciona', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Início' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
      await dropFile(page, fixtures.flac);
      await expect(
        page.getByLabel('Arquivo escolhido').getByRole('heading', { name: 'musica-curta.flac' }),
      ).toBeVisible();
      await expect(page.getByLabel('Arquivo escolhido')).toContainText('FLAC · flac');
    } finally {
      await app.close();
    }
  });

  test('arquivo corrompido e extensão não aceita mostram o erro', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Início' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();
      await answerDialog(app, fixtures.corrupted);
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(page.getByRole('alert')).toContainText('Arquivo corrompido ou formato não suportado.');

      await dropFile(page, fixtures.wrongExtension);
      await expect(page.getByRole('alert')).toContainText(
        'Formato não suportado. Envie um arquivo MP3, WAV, FLAC, M4A/AAC ou OGG.',
      );
    } finally {
      await app.close();
    }
  });
});
