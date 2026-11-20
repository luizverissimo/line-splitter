import { z } from 'zod';

export const modelProgressSchema = z.object({
  receivedBytes: z.number().int().min(0),
  totalBytes: z.number().int().positive(),
});
export type ModelProgress = z.infer<typeof modelProgressSchema>;

export const modelDownloadResultSchema = z.object({
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type ModelDownloadResult = z.infer<typeof modelDownloadResultSchema>;
