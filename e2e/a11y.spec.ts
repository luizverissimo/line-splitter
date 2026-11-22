import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fixtures } from '../scripts/fixtures.mjs';
import { expect, launchApp, test } from './app';
import { ensureTestEngine, linkModelsExcept, linkTestEngine } from './engine-fixture';

/** Auditoria axe (WCAG 2.1 A/AA, inclui contraste ≥ 4,5:1): nenhuma violação séria ou crítica. */
async function audit(page: Page, label: string) {
  // Modo legado: o Electron não permite abrir abas novas, que o axe usa para iframes.
  const result = await new AxeBuilder({ page })
    .setLegacyMode(true)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const serious = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(serious, label).toEqual([]);
}

// Termos técnicos e nomes próprios permitidos; o resto do texto visível precisa estar em português.
const ALLOWED =
  /\b(MP3|GPU|CPU|FFmpeg|ffprobe|Python|PyTorch|Demucs|CUDA|htdemucs_6s|audio-separator|RoFormer|Roformer|MelBand|Bleedless|BS-Roformer-SW|Kim|FT2|Line Splitter|Electron|Linux|Windows|macOS|kbps|kHz|MB|GB|WAV|FLAC|M4A|AAC|OGG|pcm_s16le|mp3|flac|vorbis|aac|NVIDIA|GeForce|RTX|Laptop|apt|winget|brew|sudo|install|python3|python3-venv|ffmpeg|Python\.Python\.3\.12|Gyan\.FFmpeg)\b/g;
const ENGLISH =
  /\b(Loading|Error|Cancel|Save|Settings|Home|History|Retry|Open|Choose|File|Files|Delete|Remove|Play|Pause|Mute|Submit|Close|Back|Next|Install|Installing|Engine|Model|Ready|Failed|Success|Separate|Separating|Result|Output|Folder|Browse|Select|Drop|Drag|Done|Processing|Elapsed|Time|Device|Quality|Path|Empty|Not found|Try again|Show|Copy|Details|About|Quit|Edit|Undo|Redo|Paste|Stop|Start|Warning|Help|Search|Instrument|Progress|Unknown|Missing|vocals|drums|bass|guitar|other|Vocals|Drums|Bass|Guitar)\b/;

async function englishLeftovers(page: Page): Promise<string[]> {
  const texts = await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      // Só ficam de fora nomes/caminhos de arquivo do usuário e saídas técnicas (log, comandos).
      if (!el || el.closest('pre, code, [data-path]')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const t = n.textContent?.trim();
      if (t) out.push(t);
    }
    for (const el of Array.from(document.querySelectorAll('[aria-label], [title], [placeholder]'))) {
      for (const attr of ['aria-label', 'title', 'placeholder']) {
        const v = el.getAttribute(attr);
        if (v) out.push(v);
      }
    }
    return out;
  });
  return texts.map((t) => t.replace(ALLOWED, '')).filter((t) => ENGLISH.test(t));
}

async function check(page: Page, label: string) {
  await audit(page, label);
  expect(await englishLeftovers(page), label).toEqual([]);
}

/** O elemento focado mostra o anel de foco (box-shadow/outline próprio ou do cartão que o contém). */
async function hasVisibleFocus(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return false;
    const s = getComputedStyle(el);
    const label = el.closest('label');
    const ls = label ? getComputedStyle(label) : null;
    return (
      (s.boxShadow !== 'none' && s.boxShadow !== '') ||
      (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') ||
      (ls !== null && ls.boxShadow !== 'none' && ls.boxShadow !== '')
    );
  });
}

test.describe('Acessibilidade e idioma', () => {
  test('todas as telas e estados: axe sem violações sérias e nenhum texto de interface em inglês', async ({
    userData,
  }) => {
    test.setTimeout(15 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Início' }).click();
      await expect(page.getByText('Nenhum arquivo escolhido')).toBeVisible();
      await check(page, 'Início vazio');

      await page.getByRole('link', { name: 'Motor' }).click();
      await expect(page.getByText('Tudo pronto para separar.')).toBeVisible({ timeout: 60_000 });
      await check(page, 'Motor pronto');

      await page.getByRole('link', { name: 'Histórico' }).click();
      await expect(page.getByRole('heading', { name: 'Nenhuma separação ainda' })).toBeVisible();
      await check(page, 'Histórico vazio');

      await page.getByRole('link', { name: 'Configurações' }).click();
      await page.getByLabel('Pasta de saída').fill(path.join(userData, 'Saída'));
      await page.getByLabel('Dispositivo de processamento').selectOption('cpu');
      await page.getByLabel('Caminho do Python').fill('relativo');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('O caminho do Python precisa ser absoluto.')).toBeVisible();
      await check(page, 'Configurações com erro de validação');
      await page.getByRole('button', { name: 'Usar detecção automática' }).first().click();
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();

      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [f],
        })) as typeof dialog.showOpenDialog;
      }, fixtures.corrupted);
      await page.getByRole('link', { name: 'Início' }).click();
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(page.getByRole('alert')).toContainText('Arquivo corrompido');
      await check(page, 'Início com erro');

      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [f],
        })) as typeof dialog.showOpenDialog;
      }, fixtures.longMusic);
      await page.getByRole('button', { name: 'Escolher arquivo' }).click();
      await expect(page.getByRole('group', { name: 'Qual instrumento você quer separar?' })).toBeVisible();
      await check(page, 'Arquivo carregado e escolha do instrumento');

      await page.locator('label.selectable-card', { hasText: 'Canto e falas' }).click();
      await page.getByRole('button', { name: 'Separar' }).click();
      await expect(page.getByRole('heading', { name: 'Separando: Voz' })).toBeVisible();
      await check(page, 'Processamento');
      await expect(page.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
        timeout: 10 * 60_000,
      });
      await check(page, 'Resultado');

      await page.getByRole('link', { name: 'Histórico' }).click();
      await expect(page.getByRole('list', { name: 'Separações' })).toBeVisible();
      await check(page, 'Histórico com item');
      await page.getByRole('button', { name: 'Remover' }).click();
      await expect(page.getByRole('dialog', { name: 'Remover do histórico?' })).toBeVisible();
      await check(page, 'Diálogo de remoção');
    } finally {
      await app.close();
    }
  });

  test('o fluxo principal funciona só com o teclado, com foco visível', async ({ userData }) => {
    test.setTimeout(15 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    const { app, page } = await launchApp(userData);
    const focusVisible = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return false;
        const s = getComputedStyle(el);
        const label = el.closest('label');
        const ls = label ? getComputedStyle(label) : null;
        return (
          (s.boxShadow !== 'none' && s.boxShadow !== '') ||
          (s.outlineStyle !== 'none' && s.outlineWidth !== '0px') ||
          (ls !== null && ls.boxShadow !== 'none' && ls.boxShadow !== '')
        );
      });
    /** Tab até o elemento cujo nome acessível bate (no máximo 40 tabs). */
    async function tabTo(name: RegExp) {
      const seen: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        const current = await page.evaluate(
          () =>
            (document.activeElement as HTMLElement | null)?.getAttribute('aria-label') ??
            (document.activeElement as HTMLElement | null)?.closest('label, a, button')?.textContent ??
            '',
        );
        seen.push(current);
        if (name.test(current)) return;
      }
      throw new Error(`Não chegou a ${name} pelo teclado; últimos: ${seen.slice(-8).join(' | ')}`);
    }
    try {
      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [f],
        })) as typeof dialog.showOpenDialog;
      }, fixtures.wav);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      await tabTo(/^Configurações$/);
      expect(await focusVisible()).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();

      await tabTo(/^Início$/);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { level: 1, name: 'Início' })).toBeVisible();

      await tabTo(/Escolher arquivo/);
      expect(await focusVisible()).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('Arquivo escolhido')).toContainText('musica-curta.wav');

      await tabTo(/^VozCanto e falas$/);
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('radio', { name: /Bateria/ })).toBeChecked();
      expect(await focusVisible()).toBe(true);

      // O botão só fica habilitado depois que a verificação do motor responde.
      await expect(page.getByRole('button', { name: 'Separar' })).toBeEnabled({ timeout: 60_000 });
      await tabTo(/^Separar$/);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
        timeout: 10 * 60_000,
      });

      // Botões só de ícone (players) têm nome acessível.
      const iconButtons = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button.icon-button')).map(
          (b) => b.getAttribute('aria-label') ?? '',
        ),
      );
      expect(iconButtons.length).toBeGreaterThan(0);
      expect(iconButtons.filter((n) => n.trim() === '')).toEqual([]);
    } finally {
      await app.close();
    }
  });

  test('Motor sem motor/modelo, instalação, falhas, separação com erro e página inexistente', async ({
    userData,
  }) => {
    test.setTimeout(15 * 60_000);
    const { app, page } = await launchApp(userData);
    try {
      // Primeira execução: itens com problema, painéis de instalação e de download.
      await expect(page.getByRole('heading', { level: 1, name: 'Motor de separação' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Instalar motor' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Baixar modelos' })).toBeVisible();
      await check(page, 'Motor com problema');

      // Instalação em andamento (etapas e log) e cancelada.
      await page.getByRole('button', { name: 'Instalar motor' }).click();
      await expect(page.getByText(/Etapa [12] de 5/)).toBeVisible();
      await expect(page.getByLabel('Log da instalação')).toBeVisible();
      await check(page, 'Instalação em andamento');
      await page.getByRole('button', { name: 'Cancelar instalação' }).click();
      await expect(page.getByText('Instalação cancelada. O ambiente parcial foi removido.')).toBeVisible({
        timeout: 30_000,
      });
      await check(page, 'Instalação cancelada');

      // Download em andamento e cancelado.
      await page.getByRole('button', { name: 'Baixar modelos' }).click();
      await expect(page.getByText(/Baixando |Conectando/)).toBeVisible();
      await check(page, 'Download em andamento');
      await page.getByRole('button', { name: 'Cancelar download' }).click();
      await expect(
        page.getByText('Download dos modelos cancelado. O que já foi baixado é aproveitado na próxima vez.'),
      ).toBeVisible();
      await check(page, 'Download cancelado');

      // Página inexistente.
      await page.evaluate(() => {
        window.location.hash = '#/nao-existe';
      });
      await expect(page.getByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeVisible();
      await check(page, 'Página não encontrada');
    } finally {
      await app.close();
    }

    // Instalação que falha (sem acesso aos pacotes): erro com log técnico.
    const proxy = 'http://127.0.0.1:9';
    const offline = await launchApp(userData, {
      HTTPS_PROXY: proxy,
      https_proxy: proxy,
      HTTP_PROXY: proxy,
      http_proxy: proxy,
      PIP_RETRIES: '1',
      PIP_TIMEOUT: '3',
    });
    try {
      await offline.page.getByRole('button', { name: 'Instalar motor' }).click();
      await expect(offline.page.getByText('A instalação do motor falhou')).toBeVisible({ timeout: 120_000 });
      await check(offline.page, 'Instalação com falha');
    } finally {
      await offline.app.close();
    }
  });

  test('separação com erro do motor', async ({ userData }) => {
    test.setTimeout(15 * 60_000);
    const realEngine = await ensureTestEngine();
    const engineDir = path.join(userData, 'engine');
    fs.mkdirSync(path.join(engineDir, 'models'), { recursive: true });
    // Os modelos novos (DEC-017) vêm íntegros do motor de teste; só o do Demucs é criado errado aqui.
    await linkModelsExcept(userData, ['5c90dfd2-34c22ccb.th', 'htdemucs_6s.yaml']);
    fs.symlinkSync(path.join(realEngine, 'venv'), path.join(engineDir, 'venv'), 'dir');
    const fd = fs.openSync(path.join(engineDir, 'models', '5c90dfd2-34c22ccb.th'), 'w');
    fs.ftruncateSync(fd, 54_996_327);
    fs.closeSync(fd);
    fs.writeFileSync(path.join(engineDir, 'models', 'htdemucs_6s.yaml'), "models: ['5c90dfd2']\n");
    const { app, page } = await launchApp(userData);
    try {
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
      await expect(page.getByText('A separação falhou')).toBeVisible({ timeout: 5 * 60_000 });
      await check(page, 'Separação com erro');
    } finally {
      await app.close();
    }
  });

  test('Configurações, Histórico, Motor e player só com o teclado', async ({ userData }) => {
    test.setTimeout(15 * 60_000);
    linkTestEngine(userData, await ensureTestEngine());
    const { app, page } = await launchApp(userData);
    const focused = () =>
      page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el?.getAttribute('aria-label') ?? el?.closest('label, a, button')?.textContent ?? el?.id ?? '';
      });
    async function tabTo(name: RegExp, shift = false) {
      const seen: string[] = [];
      for (let i = 0; i < 50; i += 1) {
        await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab');
        const current = await focused();
        seen.push(current);
        if (name.test(current)) return;
      }
      throw new Error(`Não chegou a ${name} pelo teclado; últimos: ${seen.slice(-8).join(' | ')}`);
    }
    try {
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      // Configurações: select com setas e salvar com Enter.
      await tabTo(/^Configurações$/);
      await page.keyboard.press('Enter');
      await expect(page.getByLabel('Qualidade do MP3')).toHaveValue('320');
      await tabTo(/^bitrateKbps$/);
      expect(await hasVisibleFocus(page)).toBe(true);
      await page.keyboard.press('ArrowUp');
      await expect(page.getByLabel('Qualidade do MP3')).toHaveValue('256');
      await tabTo(/^device$/);
      expect(await hasVisibleFocus(page)).toBe(true);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await expect(page.getByLabel('Dispositivo de processamento')).toHaveValue('cpu');
      await tabTo(/^Salvar configurações$/);
      expect(await hasVisibleFocus(page)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.getByText('Configurações salvas.')).toBeVisible();

      // Uma separação pelo teclado para ter resultado e histórico.
      await app.evaluate(({ dialog }, f) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [f],
        })) as typeof dialog.showOpenDialog;
      }, fixtures.wav);
      await tabTo(/^Início$/, true);
      await page.keyboard.press('Enter');
      await tabTo(/Escolher arquivo/);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('group', { name: 'Qual instrumento você quer separar?' })).toBeVisible();
      await tabTo(/^VozCanto e falas$/);
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: 'Separar' })).toBeEnabled({ timeout: 60_000 });
      await tabTo(/^Separar$/);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Pronto! Dois arquivos gerados' })).toBeVisible({
        timeout: 10 * 60_000,
      });

      // Player: barra de posição e volume com as setas.
      const player = page.getByRole('group', { name: 'Player: musica-curta - Voz.mp3' });
      const audio = player.locator('audio');
      await expect
        .poll(() => audio.evaluate((a: HTMLAudioElement) => a.readyState))
        .toBeGreaterThanOrEqual(1);
      await tabTo(/^Posição em musica-curta - Voz\.mp3$/);
      for (let i = 0; i < 20; i += 1) await page.keyboard.press('ArrowRight');
      await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime)).toBeGreaterThan(1);
      await tabTo(/^Volume de musica-curta - Voz\.mp3$/);
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.volume)).toBeLessThan(1);

      // Histórico: Remover abre o diálogo com foco dentro; Esc fecha e devolve o foco; confirmar remove.
      await tabTo(/^Histórico$/, true);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('list', { name: 'Separações' })).toBeVisible();
      await tabTo(/^Remover$/);
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'Remover do histórico?' });
      await expect(dialog).toBeVisible();
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
      expect(await hasVisibleFocus(page)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      expect(await focused()).toBe('Remover');
      await page.keyboard.press('Enter');
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 6 && (await focused()) !== 'Remover'; i += 1) await page.keyboard.press('Tab');
      expect(await focused()).toBe('Remover');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Nenhuma separação ainda' })).toBeVisible();

      // Motor: "Verificar de novo" pelo teclado.
      await tabTo(/^Motor$/, true);
      await page.keyboard.press('Enter');
      await tabTo(/^Verificar de novo$/);
      await page.keyboard.press('Enter');
      await expect(page.getByText('Tudo pronto para separar.')).toBeVisible({ timeout: 60_000 });
    } finally {
      await app.close();
    }
  });

  test('Motor: instalar e baixar o modelo pelo teclado', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    const focused = () =>
      page.evaluate(() => (document.activeElement as HTMLElement | null)?.textContent?.trim() ?? '');
    async function tabTo(name: string) {
      for (let i = 0; i < 40; i += 1) {
        await page.keyboard.press('Tab');
        if ((await focused()) === name) return;
      }
      throw new Error(`Não chegou a "${name}" pelo teclado`);
    }
    try {
      await expect(page.getByRole('heading', { level: 1, name: 'Motor de separação' })).toBeVisible();
      await tabTo('Instalar motor');
      expect(await hasVisibleFocus(page)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Cancelar instalação' })).toBeVisible();
      await tabTo('Cancelar instalação');
      expect(await hasVisibleFocus(page)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.getByText('Instalação cancelada. O ambiente parcial foi removido.')).toBeVisible({
        timeout: 30_000,
      });
      await tabTo('Baixar modelos');
      expect(await hasVisibleFocus(page)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Cancelar download' })).toBeVisible();
      await tabTo('Cancelar download');
      expect(await hasVisibleFocus(page)).toBe(true);
      await page.keyboard.press('Enter');
      await expect(
        page.getByText('Download dos modelos cancelado. O que já foi baixado é aproveitado na próxima vez.'),
      ).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
