import { z } from 'zod';
import { deviceSchema } from './settings';

export const MIN_PYTHON = [3, 9] as const;

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

export const engineStatusSchema = z.object({
  python: engineItemSchema.extend({ path: z.string().nullable() }),
  ffmpeg: engineItemSchema.extend({ path: z.string().nullable(), ffprobePath: z.string().nullable() }),
  demucs: engineItemSchema,
  model: engineItemSchema,
  device: engineDeviceSchema,
  /** Pasta do ambiente Python gerenciado pelo app. */
  engineDir: z.string(),
  ready: z.boolean(),
});
export type EngineStatus = z.infer<typeof engineStatusSchema>;
