import { z } from 'zod';

export const installStepSchema = z.object({
  step: z.number().int().min(1),
  total: z.number().int().min(1),
  label: z.string().min(1),
});
export type InstallStep = z.infer<typeof installStepSchema>;

export const installLogSchema = z.object({
  line: z.string(),
  stream: z.enum(['stdout', 'stderr', 'info']),
});
export type InstallLog = z.infer<typeof installLogSchema>;

export const installInputSchema = z.object({
  /** true = apaga o ambiente existente e instala do zero. */
  reinstall: z.boolean(),
});

export const installResultSchema = z.object({
  /** Versões instaladas e conferidas importando o separador no ambiente novo. */
  separator: z.string().min(1),
  torch: z.string().min(1),
  cuda: z.boolean(),
});
export type InstallResult = z.infer<typeof installResultSchema>;
