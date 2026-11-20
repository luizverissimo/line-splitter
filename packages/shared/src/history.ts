import { z } from 'zod';
import { stemSchema } from './instruments';

export const historyOutputSchema = z.object({
  path: z.string().min(1),
  exists: z.boolean(),
  /** URL `media://` quando o arquivo existe (para ouvir); null se foi movido/apagado. */
  url: z.string().startsWith('media://').nullable(),
});

export const historyItemSchema = z.object({
  id: z.number().int().positive(),
  createdAt: z.string().min(1),
  sourcePath: z.string().min(1),
  sourceName: z.string().min(1),
  stem: stemSchema,
  audioDurationS: z.number().positive(),
  processingMs: z.number().int().min(0),
  device: z.enum(['cuda', 'cpu']),
  bitrateKbps: z.union([z.literal(192), z.literal(256), z.literal(320)]),
  instrument: historyOutputSchema,
  rest: historyOutputSchema,
});
export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyRemoveInputSchema = z.object({
  id: z.number().int().positive(),
  deleteFiles: z.boolean(),
});

export const historyRemoveResultSchema = z.object({
  removed: z.literal(true),
  /** Arquivos apagados do disco (só quando pedido). */
  deletedFiles: z.array(z.string()),
});
