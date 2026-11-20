import { BrowserWindow } from 'electron';
import path from 'node:path';

export const SECURE_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  nodeIntegrationInWorker: false,
  sandbox: true,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: false,
  spellcheck: false,
} as const;

export function createMainWindow(startUrl: string, preloadDir: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 880,
    minHeight: 600,
    show: false,
    title: 'Line Splitter',
    backgroundColor: '#0f1115',
    autoHideMenuBar: false,
    webPreferences: { ...SECURE_WEB_PREFERENCES, preload: path.join(preloadDir, 'preload.cjs') },
  });
  win.once('ready-to-show', () => win.show());
  void win.loadURL(startUrl);
  return win;
}
