import { BrowserWindow } from 'electron';
import { ipc, type IpcEvent, type PayloadOf, type ipcEvents } from '@line-splitter/shared';

/** Envia um evento main → renderer para todas as janelas, validado pelo contrato. */
export function broadcast<E extends IpcEvent>(event: E, payload: PayloadOf<typeof ipcEvents, E>): void {
  const data = ipc.encodeEvent(event, payload);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(event, data);
  }
}
