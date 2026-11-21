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
    const guarded = guardSender(handlers[channel], isTrustedSender);
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, payload: unknown) =>
      guarded(event.senderFrame?.url ?? '', payload),
    );
  }
}

/** Só executa o handler se a mensagem veio de um frame da origem do app; senão responde FORBIDDEN. */
export function guardSender(handler: RegisteredHandler, isTrustedSender: (url: string) => boolean) {
  return async (senderUrl: string, payload: unknown): Promise<IpcResult> => {
    if (!isTrustedSender(senderUrl)) {
      return {
        ok: false,
        error: new AppError('FORBIDDEN', 'Origem não autorizada para o canal.', senderUrl).toJSON(),
      };
    }
    return handler(payload);
  };
}
