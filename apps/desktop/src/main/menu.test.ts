import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMenuTemplate, openOutputFolder } from './menu';

describe('menu nativo', () => {
  it('estrutura em português: Arquivo, Editar e Ajuda com as ações do PRD', () => {
    const template = buildMenuTemplate({ outputDir: () => '/x', mainWindow: () => undefined });
    expect(template.map((m) => m.label)).toEqual(['Arquivo', 'Editar', 'Ajuda']);
    const labels = (i: number) =>
      (template[i]?.submenu as { label?: string; type?: string }[])
        .filter((m) => m.type !== 'separator')
        .map((m) => m.label);
    expect(labels(0)).toEqual(['Escolher arquivo…', 'Abrir pasta de saída', 'Sair']);
    expect(labels(2)).toEqual(['Sobre o Line Splitter']);
    const withoutAction = (
      template[0]?.submenu as { label?: string; click?: unknown; role?: string }[]
    ).filter((item) => item.label && !item.click && !item.role);
    expect(withoutAction).toEqual([]);
  });

  it('abrir a pasta de saída cria a pasta se faltar e pede ao sistema para abri-la', async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-menu-'));
    const dir = path.join(base, 'Line Splitter');
    const opened: string[] = [];
    try {
      const err = await openOutputFolder(dir, async (p) => {
        opened.push(p);
        return '';
      });
      expect(err).toBe('');
      expect(fs.statSync(dir).isDirectory()).toBe(true);
      expect(opened).toEqual([dir]);
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});
