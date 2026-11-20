import { BrowserWindow, dialog } from 'electron';
import { ipc } from '@line-splitter/shared';

const parentWindow = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];

/** Diálogos nativos de escolha de pasta/arquivo; devolvem null se o usuário cancelar. */
export function dialogHandlers() {
  return {
    'dialog:chooseDirectory': ipc.defineHandler('dialog:chooseDirectory', async ({ title, defaultPath }) => {
      const win = parentWindow();
      const options: Electron.OpenDialogOptions = {
        title,
        properties: ['openDirectory', 'createDirectory'],
        ...(defaultPath ? { defaultPath } : {}),
      };
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    }),
    'dialog:chooseFile': ipc.defineHandler('dialog:chooseFile', async ({ title, defaultPath, filters }) => {
      const win = parentWindow();
      const options: Electron.OpenDialogOptions = {
        title,
        properties: ['openFile'],
        ...(defaultPath ? { defaultPath } : {}),
        ...(filters ? { filters } : {}),
      };
      const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    }),
  };
}
