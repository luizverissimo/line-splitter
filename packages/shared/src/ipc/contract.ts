import { z } from 'zod';
import { createIpc, type ChannelMap, type EventMap } from './ipc';
import { settingsSchema, settingsUpdateSchema } from '../settings';
import { engineStatusSchema } from '../engine';
import { modelDownloadResultSchema, modelProgressSchema } from '../model';
import { audioInfoSchema, audioInspectInputSchema } from '../audio';
import { historyItemSchema, historyRemoveInputSchema, historyRemoveResultSchema } from '../history';
import { separationProgressSchema, separationResultSchema, separationStartInputSchema } from '../separation';
import {
  installInputSchema,
  installLogSchema,
  installResultSchema,
  installStepSchema,
} from '../engine-install';

export const appInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  platform: z.enum(['linux', 'win32', 'darwin']),
  electron: z.string().min(1),
});
export type AppInfo = z.infer<typeof appInfoSchema>;

export const chooseDirectoryInputSchema = z.object({
  title: z.string().min(1),
  defaultPath: z.string().optional(),
});
export const chooseFileInputSchema = z.object({
  title: z.string().min(1),
  defaultPath: z.string().optional(),
  /** Filtros do diálogo nativo, ex.: [{ name: 'Áudio', extensions: ['mp3'] }]. */
  filters: z
    .array(z.object({ name: z.string().min(1), extensions: z.array(z.string().min(1)).min(1) }))
    .optional(),
});
/** Caminho escolhido, ou null se o usuário cancelou o diálogo. */
export const chosenPathSchema = z.string().min(1).nullable();

/** Contrato dos canais IPC renderer → main. Cada funcionalidade acrescenta os seus canais aqui. */
export const ipcChannels = {
  'app:info': { input: z.undefined(), output: appInfoSchema },
  'settings:get': { input: z.undefined(), output: settingsSchema },
  'settings:update': { input: settingsUpdateSchema, output: settingsSchema },
  'dialog:chooseDirectory': { input: chooseDirectoryInputSchema, output: chosenPathSchema },
  'dialog:chooseFile': { input: chooseFileInputSchema, output: chosenPathSchema },
  'engine:status': { input: z.undefined(), output: engineStatusSchema },
  'engine:install': { input: installInputSchema, output: installResultSchema },
  'engine:cancelInstall': { input: z.undefined(), output: z.object({ cancelled: z.boolean() }) },
  'engine:downloadModel': { input: z.undefined(), output: modelDownloadResultSchema },
  'audio:inspect': { input: audioInspectInputSchema, output: audioInfoSchema },
  'history:list': { input: z.undefined(), output: z.array(historyItemSchema) },
  'history:remove': { input: historyRemoveInputSchema, output: historyRemoveResultSchema },
  'separation:start': { input: separationStartInputSchema, output: separationResultSchema },
  'separation:cancel': { input: z.undefined(), output: z.object({ cancelled: z.boolean() }) },
  'shell:openFolder': {
    input: z.object({ path: z.string().min(1) }),
    output: z.object({ opened: z.literal(true) }),
  },
  'shell:showFile': {
    input: z.object({ path: z.string().min(1) }),
    output: z.object({ shown: z.literal(true) }),
  },
  'engine:cancelDownload': { input: z.undefined(), output: z.object({ cancelled: z.boolean() }) },
} satisfies ChannelMap;

/** Eventos main → renderer. */
export const ipcEvents = {
  'engine:installStep': installStepSchema,
  'engine:installLog': installLogSchema,
  'engine:modelProgress': modelProgressSchema,
  'separation:progress': separationProgressSchema,
  /** Menu Arquivo › Escolher arquivo… */
  'menu:chooseFile': z.object({ requestedAt: z.number() }),
} satisfies EventMap;

export const ipc = createIpc(ipcChannels, ipcEvents);
export type IpcChannel = keyof typeof ipcChannels;
export type IpcEvent = keyof typeof ipcEvents;
