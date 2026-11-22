import { z } from 'zod';

export const modelProgressSchema = z.object({
  /** Somatório de todos os arquivos que faltam baixar. */
  receivedBytes: z.number().int().min(0),
  totalBytes: z.number().int().positive(),
  /** Nome do modelo sendo baixado agora. */
  model: z.string().min(1),
});
export type ModelProgress = z.infer<typeof modelProgressSchema>;

export const modelDownloadResultSchema = z.object({
  /** Bytes efetivamente transferidos nesta execução (sem contar o que foi aproveitado de um parcial; 0 se tudo já estava baixado). */
  sizeBytes: z.number().int().min(0),
  /** Modelos baixados e conferidos nesta execução. */
  models: z.array(z.string().min(1)),
});
export type ModelDownloadResult = z.infer<typeof modelDownloadResultSchema>;
