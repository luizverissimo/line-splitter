import { app } from 'electron';
import { ipc } from '@line-splitter/shared';

export const appInfoHandler = ipc.defineHandler('app:info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform as 'linux' | 'win32' | 'darwin',
  electron: process.versions.electron ?? 'desconhecida',
}));
