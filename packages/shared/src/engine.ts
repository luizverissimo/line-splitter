import { z } from 'zod';
import { deviceSchema } from './settings';

/** Menor Python aceito pelo audio-separator usado no motor (DEC-017). */
export const MIN_PYTHON = [3, 10] as const;
/** Maior Python com pacotes do PyTorch 2.6 usado pelo motor. */
export const MAX_PYTHON = [3, 13] as const;

export const engineItemSchema = z.object({
  ok: z.boolean(),
  /** Versão encontrada (quando ok) ou motivo da falha, em português. */
  detail: z.string().min(1),
});
export type EngineItem = z.infer<typeof engineItemSchema>;

export const engineDeviceSchema = z.object({
  preference: deviceSchema,
  effective: z.enum(['cuda', 'cpu']),
  cudaAvailable: z.boolean(),
  gpuName: z.string().nullable(),
  /** Aviso quando a preferência não pôde ser atendida (ex.: GPU pedida sem CUDA). */
  warning: z.string().nullable(),
});
export type EngineDevice = z.infer<typeof engineDeviceSchema>;

/** Um modelo de separação usado pelo motor (DEC-017) e se já está baixado e íntegro. */
export const engineModelSchema = engineItemSchema.extend({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Instrumentos separados por este modelo, em português (ex.: "Voz"). */
  instruments: z.array(z.string().min(1)).min(1),
  sizeBytes: z.number().int().positive(),
});
export type EngineModel = z.infer<typeof engineModelSchema>;

export const engineStatusSchema = z.object({
  python: engineItemSchema.extend({ path: z.string().nullable() }),
  ffmpeg: engineItemSchema.extend({ path: z.string().nullable(), ffprobePath: z.string().nullable() }),
  /** Ambiente Python do app com o separador (audio-separator + PyTorch). */
  separator: engineItemSchema,
  /** Resumo: todos os modelos baixados e íntegros. */
  model: engineItemSchema,
  models: z.array(engineModelSchema).min(1),
  device: engineDeviceSchema,
  /** Pasta do ambiente Python gerenciado pelo app. */
  engineDir: z.string(),
  ready: z.boolean(),
});
export type EngineStatus = z.infer<typeof engineStatusSchema>;
