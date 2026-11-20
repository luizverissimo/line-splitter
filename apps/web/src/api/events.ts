import { ipc, type IpcEvent, type PayloadOf, type ipcEvents } from '@line-splitter/shared';
import { getBridge } from './bridge';

/** Assina um evento main → renderer; payloads fora do contrato são descartados. Devolve o cancelamento. */
export function subscribe<E extends IpcEvent>(
  event: E,
  handler: (payload: PayloadOf<typeof ipcEvents, E>) => void,
): () => void {
  return getBridge().on(event, (raw) => {
    const payload = ipc.decodeEvent(event, raw);
    if (payload !== null) handler(payload);
  });
}
