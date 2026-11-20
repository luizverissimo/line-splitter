import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { ipc, type DesktopBridge } from '@line-splitter/shared';

// Única superfície exposta ao renderer: canais e eventos do contrato, nada mais.
const bridge: DesktopBridge = {
  invoke: (channel, payload) => {
    if (!ipc.isChannel(channel)) return Promise.reject(new Error(`Canal IPC não permitido: ${channel}`));
    return ipcRenderer.invoke(channel, payload);
  },
  on: (event, listener) => {
    if (!ipc.isEvent(event)) throw new Error(`Evento IPC não permitido: ${event}`);
    const wrapped = (_e: Electron.IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on(event, wrapped);
    return () => {
      ipcRenderer.removeListener(event, wrapped);
    };
  },
  pathForFile: (file) => {
    const filePath = webUtils.getPathForFile(file);
    if (!filePath) throw new Error('O arquivo solto não está no disco (arraste um arquivo de uma pasta).');
    return filePath;
  },
};

contextBridge.exposeInMainWorld('api', bridge);
