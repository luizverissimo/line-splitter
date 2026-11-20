import { z } from 'zod';
import { createIpc, type ChannelMap, type EventMap } from './ipc';

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.enum(['linux', 'win32', 'darwin']),
  electron: z.string().min(1),
});
export type AppInfo = z.infer<typeof appInfoSchema>;

/** Contrato dos canais IPC renderer → main. Cada funcionalidade acrescenta os seus canais aqui. */
export const ipcChannels = {
  'app:info': { input: z.undefined(), output: appInfoSchema },
} satisfies ChannelMap;

/** Eventos main → renderer. */
export const ipcEvents = {} satisfies EventMap;

export const ipc = createIpc(ipcChannels, ipcEvents);
export type IpcChannel = keyof typeof ipcChannels;
export type IpcEvent = keyof typeof ipcEvents;
