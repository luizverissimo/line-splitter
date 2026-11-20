import type { IpcTransport } from './ipc';

/** API que o preload do Electron expõe em `window.api` (único acesso do renderer ao processo principal). */
export interface DesktopBridge {
  /** Envia um canal IPC e devolve o envelope `{ ok, data | error }`. */
  invoke: IpcTransport;
  /** Assina um evento main → renderer; devolve a função para cancelar a assinatura. */
  on: (event: string, listener: (payload: unknown) => void) => () => void;
  /** Caminho no disco de um arquivo arrastado para a janela (webUtils.getPathForFile, DEC-006). */
  pathForFile: (file: File) => string;
}
