import { shell } from 'electron';
import { AppError, ipc } from '@line-splitter/shared';
import fs from 'node:fs';
import path from 'node:path';
import type { HistoryRepository } from '../history/repository';

/** O que usamos do `shell` do Electron (o gerenciador de arquivos do sistema). */
export interface FileManager {
  openPath: (path: string) => Promise<string>;
  showItemInFolder: (path: string) => void;
}

/** Abre a pasta / mostra o arquivo no gerenciador do sistema, só para saídas registradas no histórico. */
export function shellHandlers(history: HistoryRepository, fileManager: FileManager = shell) {
  const allowed = (filePath: string) => {
    const normalized = path.normalize(filePath);
    if (!path.isAbsolute(normalized) || !history.isKnownOutput(normalized)) {
      throw new AppError('FORBIDDEN_PATH', 'Este arquivo não é uma saída do Line Splitter.', filePath);
    }
    return normalized;
  };
  return {
    'shell:openFolder': ipc.defineHandler('shell:openFolder', async ({ path: filePath }) => {
      const dir = path.dirname(allowed(filePath));
      if (!fs.existsSync(dir)) throw new AppError('NOT_FOUND', 'A pasta de saída não existe mais.', dir);
      const error = await fileManager.openPath(dir);
      if (error) throw new AppError('IO', 'Não foi possível abrir a pasta.', error);
      return { opened: true as const };
    }),
    'shell:showFile': ipc.defineHandler('shell:showFile', ({ path: filePath }) => {
      const file = allowed(filePath);
      if (!fs.existsSync(file))
        throw new AppError('NOT_FOUND', 'Arquivo não encontrado. Ele pode ter sido movido ou apagado.', file);
      fileManager.showItemInFolder(file);
      return { shown: true as const };
    }),
  };
}
