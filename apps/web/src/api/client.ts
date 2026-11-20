import { ipc, type InputOf, type IpcChannel, type OutputOf, type ipcChannels } from '@line-splitter/shared';
import { getBridge } from './bridge';

type Channels = typeof ipcChannels;

/** Chama um canal IPC com validação de entrada e saída (lança AppError em falha). */
export function call<C extends IpcChannel>(
  channel: C,
  input: InputOf<Channels, C>,
): Promise<OutputOf<Channels, C>> {
  return ipc.invoke(getBridge().invoke, channel, input);
}
