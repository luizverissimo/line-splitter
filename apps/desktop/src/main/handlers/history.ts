import { AppError, ipc, type HistoryItem } from '@line-splitter/shared';
import fs from 'node:fs';
import path from 'node:path';
import type { HistoryRepository, SeparationRow } from '../history/repository';
import type { MediaRegistry } from '../media/registry';

export function historyHandlers(history: HistoryRepository, media: MediaRegistry) {
  // Cada saída conta um único uso do histórico no registro de mídia, liberado ao remover o item.
  const urls = new Map<string, string>();
  const output = (filePath: string) => {
    const exists = fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    if (!exists) return { path: filePath, exists, url: null };
    let url = urls.get(filePath);
    if (!url) {
      url = media.register(filePath);
      urls.set(filePath, url);
    }
    return { path: filePath, exists, url };
  };
  const release = (filePath: string) => {
    if (urls.delete(filePath)) media.unregister(filePath);
  };
  const toItem = (r: SeparationRow): HistoryItem => ({
    id: r.id,
    createdAt: r.createdAt,
    sourcePath: r.sourcePath,
    sourceName: r.sourceName,
    stem: r.stem,
    audioDurationS: r.audioDurationS,
    processingMs: r.processingMs,
    device: r.device,
    bitrateKbps: r.bitrateKbps,
    instrument: output(r.instrumentOutput),
    rest: output(r.restOutput),
  });
  return {
    'history:list': ipc.defineHandler('history:list', () => history.list().map(toItem)),
    'history:remove': ipc.defineHandler('history:remove', ({ id, deleteFiles }) => {
      const row = history.get(id);
      if (!row) throw new AppError('NOT_FOUND', 'Este item não existe mais no histórico.');
      const deletedFiles: string[] = [];
      if (deleteFiles) {
        // Só os dois MP3 registrados deste item; o arquivo original nunca é tocado (RN-11).
        for (const file of [row.instrumentOutput, row.restOutput]) {
          // Proteção extra: nunca apaga o arquivo original, mesmo com dado corrompido no banco.
          if (path.resolve(file) === path.resolve(row.sourcePath)) continue;
          if (!fs.existsSync(file)) continue;
          try {
            fs.rmSync(file);
            deletedFiles.push(file);
          } catch (err) {
            const already = deletedFiles.length ? ` Já apagado: ${deletedFiles.join(', ')}.` : '';
            throw new AppError(
              'IO',
              `Não foi possível apagar ${file}. O item continua no histórico.${already}`,
              err instanceof Error ? err.message : String(err),
            );
          }
          urls.delete(file);
          media.revoke(file);
        }
      }
      release(row.instrumentOutput);
      release(row.restOutput);
      history.remove(id);
      return { removed: true as const, deletedFiles };
    }),
  };
}
