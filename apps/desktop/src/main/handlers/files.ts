import { app, BrowserWindow, dialog } from 'electron';
import { AppError, ipc } from '@line-splitter/shared';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { HistoryRepository } from '../history/repository';

/** Pergunta ao usuário onde salvar (diálogo nativo "Salvar como"); null se ele cancelar. */
export type AskSavePath = (defaultPath: string) => Promise<string | null>;

const nativeAskSavePath: AskSavePath = async (defaultPath) => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const options: Electron.SaveDialogOptions = {
    title: 'Salvar MP3',
    defaultPath,
    filters: [{ name: 'Áudio MP3', extensions: ['mp3'] }],
    // O próprio diálogo do sistema pede confirmação antes de substituir um arquivo existente.
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  };
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
  return result.canceled || !result.filePath ? null : result.filePath;
};

const ioMessage = (err: unknown, dir: string): AppError => {
  const code = (err as NodeJS.ErrnoException).code;
  const detail = err instanceof Error ? err.message : String(err);
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS')
    return new AppError('FORBIDDEN', `Sem permissão para gravar em ${dir}. Escolha outra pasta.`, detail);
  if (code === 'ENOSPC' || code === 'EDQUOT')
    return new AppError(
      'IO',
      'Não há espaço livre no disco de destino. Libere espaço ou escolha outro lugar.',
      detail,
    );
  if (code === 'ENOENT')
    return new AppError('NOT_FOUND', 'O arquivo ou a pasta de destino não existe mais.', detail);
  return new AppError('IO', 'Não foi possível salvar o MP3.', detail);
};

/**
 * "Baixar MP3": copia uma faixa gerada para o lugar escolhido no diálogo nativo.
 * Só aceita saídas registradas no histórico (o resultado atual também é gravado lá).
 */
export function fileHandlers(
  history: HistoryRepository,
  askSavePath: AskSavePath = nativeAskSavePath,
  defaultDir: () => string = () => app.getPath('downloads'),
) {
  return {
    'file:saveCopy': ipc.defineHandler('file:saveCopy', async ({ path: filePath }) => {
      const source = path.normalize(filePath);
      if (!path.isAbsolute(source) || !history.isKnownOutput(source)) {
        throw new AppError('FORBIDDEN_PATH', 'Este arquivo não é uma saída do Line Splitter.', filePath);
      }
      if (!fs.existsSync(source)) {
        throw new AppError(
          'NOT_FOUND',
          'Arquivo não encontrado. Ele pode ter sido movido ou apagado.',
          source,
        );
      }
      const chosen = await askSavePath(path.join(defaultDir(), path.basename(source)));
      if (chosen === null) return null;

      const dest = path.normalize(chosen);
      if (!path.isAbsolute(dest))
        throw new AppError('VALIDATION', 'Escolha um local válido para salvar.', chosen);
      if (path.extname(dest).toLowerCase() !== '.mp3') {
        throw new AppError('VALIDATION', 'Escolha um nome de arquivo terminado em .mp3.', dest);
      }
      if (dest === source) return { savedTo: dest };
      const dir = path.dirname(dest);
      let isDir = false;
      try {
        isDir = fs.statSync(dir).isDirectory();
      } catch {
        isDir = false;
      }
      if (!isDir) throw new AppError('NOT_FOUND', 'A pasta de destino não existe.', dir);
      try {
        fs.accessSync(dir, fs.constants.W_OK);
      } catch (err) {
        throw ioMessage(err, dir);
      }
      // Copia para um temporário na mesma pasta e só então troca: nunca deixa um MP3 pela metade.
      const tmp = path.join(dir, `.${path.basename(dest)}.${process.pid}.parcial`);
      try {
        await pipeline(fs.createReadStream(source), fs.createWriteStream(tmp));
        fs.renameSync(tmp, dest);
      } catch (err) {
        fs.rmSync(tmp, { force: true });
        const code = (err as NodeJS.ErrnoException).code;
        if ((code === 'EBUSY' || code === 'EPERM') && fs.existsSync(dest)) {
          throw new AppError(
            'IO',
            'O arquivo de destino está aberto em outro programa ou protegido. Feche-o ou escolha outro nome.',
            err instanceof Error ? err.message : String(err),
          );
        }
        if ((err as NodeJS.ErrnoException).code === 'ENOENT' && !fs.existsSync(source)) {
          throw new AppError(
            'NOT_FOUND',
            'Arquivo não encontrado. Ele pode ter sido movido ou apagado.',
            source,
          );
        }
        throw ioMessage(err, dir);
      }
      return { savedTo: dest };
    }),
  };
}
