import { app, dialog, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import fs from 'node:fs';
import { broadcast } from './events';

export interface MenuDeps {
  /** Pasta de saída atual (das Configurações). */
  outputDir: () => string;
  mainWindow: () => BrowserWindow | undefined;
}

/** Abre a pasta de saída no gerenciador de arquivos, criando-a se ainda não existir. */
export async function openOutputFolder(
  dir: string,
  open: (p: string) => Promise<string> = shell.openPath,
): Promise<string> {
  fs.mkdirSync(dir, { recursive: true });
  return open(dir);
}

/** Menu nativo em português, com ações reais. */
export function buildMenuTemplate(deps: MenuDeps): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Arquivo',
      submenu: [
        {
          label: 'Escolher arquivo…',
          accelerator: 'CmdOrCtrl+O',
          click: () => broadcast('menu:chooseFile', { requestedAt: Date.now() }),
        },
        {
          label: 'Abrir pasta de saída',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const win = deps.mainWindow();
            const report = async (detail: string) => {
              const options = {
                type: 'error' as const,
                message: 'Não foi possível abrir a pasta de saída.',
                detail,
              };
              if (win) await dialog.showMessageBox(win, options);
              else await dialog.showMessageBox(options);
            };
            try {
              const error = await openOutputFolder(deps.outputDir());
              if (error) await report(error);
            } catch (err) {
              await report(err instanceof Error ? err.message : String(err));
            }
          },
        },
        { type: 'separator' },
        { label: 'Sair', role: 'quit', accelerator: 'CmdOrCtrl+Q' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { label: 'Desfazer', role: 'undo' },
        { label: 'Refazer', role: 'redo' },
        { type: 'separator' },
        { label: 'Recortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Colar', role: 'paste' },
        { label: 'Selecionar tudo', role: 'selectAll' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Sobre o Line Splitter',
          click: async () => {
            const win = deps.mainWindow();
            const options = {
              type: 'info' as const,
              title: 'Sobre o Line Splitter',
              message: `Line Splitter ${app.getVersion()}`,
              detail:
                'Separa um instrumento de uma música e gera dois MP3: só o instrumento e a música sem ele.\n' +
                'Tudo roda neste computador, com o Demucs (htdemucs_6s) e o FFmpeg.\n' +
                `Electron ${process.versions.electron ?? ''}`,
            };
            if (win) await dialog.showMessageBox(win, options);
            else await dialog.showMessageBox(options);
          },
        },
      ],
    },
  ];
}

export function installMenu(deps: MenuDeps): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(deps)));
}
