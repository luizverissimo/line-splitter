import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { AppError, ipc, type IpcChannel, type IpcResult } from '@line-splitter/shared';

export type RegisteredHandler = (raw: unknown) => Promise<IpcResult>;
export type HandlerMap = { [C in IpcChannel]: RegisteredHandler };

/**
 * Registra um handler por canal do contrato. Mensagens de frames fora da origem do app são recusadas.
 * Exigir o mapa completo garante que todo canal do contrato tem implementação.
 */
export function registerIpcHandlers(handlers: HandlerMap, isTrustedSender: (url: string) => boolean): void {
  for (const channel of Object.keys(ipc.channels) as IpcChannel[]) {
    const handler = handlers[channel];
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, payload: unknown): Promise<IpcResult> => {
      const senderUrl = event.senderFrame?.url ?? '';
      if (!isTrustedSender(senderUrl)) {
        return {
          ok: false,
          error: new AppError('FORBIDDEN', 'Origem não autorizada para o canal.', senderUrl).toJSON(),
        };
      }
      return handler(payload);
    });
  }
}
