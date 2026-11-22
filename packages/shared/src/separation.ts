import { z } from 'zod';
import { stemSchema } from './instruments';

export const separationStartInputSchema = z.object({ stem: stemSchema });

export const separationPhaseSchema = z.enum(['preparing', 'separating', 'encoding', 'saving']);
export type SeparationPhase = z.infer<typeof separationPhaseSchema>;

export const PHASE_LABELS: Record<SeparationPhase, string> = {
  preparing: 'Preparando',
  separating: 'Separando o instrumento',
  encoding: 'Gerando os MP3',
  saving: 'Salvando na pasta de saída',
};

export const separationProgressSchema = z.object({
  phase: separationPhaseSchema,
  /** Progresso total da separação, 0–100. */
  percent: z.number().min(0).max(100),
});
export type SeparationProgress = z.infer<typeof separationProgressSchema>;

export const separationResultSchema = z.object({
  id: z.number().int().positive(),
  stem: stemSchema,
  sourcePath: z.string().min(1),
  instrumentPath: z.string().min(1),
  restPath: z.string().min(1),
  instrumentUrl: z.string().startsWith('media://'),
  restUrl: z.string().startsWith('media://'),
  processingMs: z.number().int().min(0),
  device: z.enum(['cuda', 'cpu']),
  /** Modelo de separação usado (DEC-017). */
  model: z.string().min(1),
});
export type SeparationResult = z.infer<typeof separationResultSchema>;
