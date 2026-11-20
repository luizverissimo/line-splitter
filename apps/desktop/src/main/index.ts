import { app, BrowserWindow, dialog } from 'electron';
import path from 'node:path';
import { resolveDevUrl, resolveUserDataOverride } from './env';
import { hardenApp } from './hardening';
import { registerIpcHandlers } from './ipc';
import { appInfoHandler } from './handlers/app';
import { dialogHandlers } from './handlers/dialog';
import { settingsHandlers } from './handlers/settings';
import { engineHandlers } from './handlers/engine';
import { audioHandlers, CurrentInput } from './handlers/audio';
import { enginePaths } from './engine/paths';
import { EngineInstaller } from './engine/install';
import { ModelDownloader } from './engine/model';
import { broadcast } from './events';
import { SettingsRepository } from './settings/repository';
import { defaultSettings } from './settings/defaults';
import { openDatabase, type Db } from './db/database';
import { registerAppSchemes, serveMediaProtocol, serveRenderer } from './renderer-protocol';
import { MediaRegistry } from './media/registry';
import { APP_ORIGIN, isAllowedNavigation } from './security';
import { createMainWindow } from './window';

function fatal(message: string): never {
  dialog.showErrorBox('Line Splitter não pôde iniciar', message);
  app.exit(1);
  throw new Error(message);
}

app.setName('Line Splitter');

/** Arquivos de áudio que o renderer pode tocar (entrada atual e saídas registradas). */
const mediaRegistry = new MediaRegistry();

let devUrl: URL | null;
try {
  const userData = resolveUserDataOverride(process.env);
  if (userData) app.setPath('userData', userData);
  devUrl = resolveDevUrl(process.env);
} catch (err) {
  fatal(err instanceof Error ? err.message : String(err));
}

// Segunda instância: foca a janela existente e sai.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerAppSchemes();

  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.on('window-all-closed', () => app.quit());

  void app.whenReady().then(() => {
    const origin = devUrl ? devUrl.origin : APP_ORIGIN;
    hardenApp(origin, devUrl ? devUrl.origin : null);

    if (!devUrl) {
      const rendererDir = app.isPackaged
        ? path.join(process.resourcesPath, 'renderer')
        : path.resolve(__dirname, '../../web/dist');
      try {
        serveRenderer(rendererDir);
      } catch (err) {
        fatal(err instanceof Error ? err.message : String(err));
      }
    }

    let db: Db;
    try {
      db = openDatabase(app.getPath('userData'));
    } catch (err) {
      fatal(
        `Não foi possível abrir o banco de dados local: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    app.on('will-quit', () => {
      if (db.open) db.close();
    });

    serveMediaProtocol(mediaRegistry);

    const settings = new SettingsRepository(db, defaultSettings());
    const paths = enginePaths(app.getPath('userData'));
    const installer = new EngineInstaller(paths, {
      step: (step) => broadcast('engine:installStep', step),
      log: (log) => broadcast('engine:installLog', log),
    });
    const downloader = new ModelDownloader(paths, (progress) => broadcast('engine:modelProgress', progress));
    app.on('before-quit', () => {
      installer.cancel();
      downloader.cancel();
    });

    registerIpcHandlers(
      {
        'app:info': appInfoHandler,
        ...settingsHandlers(settings),
        ...dialogHandlers(),
        ...engineHandlers(settings, paths, installer, downloader),
        ...audioHandlers(settings, new CurrentInput(mediaRegistry)),
      },
      (url) => isAllowedNavigation(url, origin),
    );

    createMainWindow(devUrl ? devUrl.toString() : `${APP_ORIGIN}/index.html`, __dirname);
  });
}
