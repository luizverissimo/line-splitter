import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'VALIDATION',
  'INVALID_RESPONSE',
  'NOT_FOUND',
  'FORBIDDEN',
  'FORBIDDEN_PATH',
  'CONFLICT',
  'ENGINE_MISSING',
  'ENGINE_FAILED',
  'OUT_OF_MEMORY',
  'CANCELLED',
  'INVALID_AUDIO',
  'IO',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const appErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  details: z.string().optional(),
});
export type AppErrorData = z.infer<typeof appErrorSchema>;

/** Erro de domínio que atravessa o IPC com código e mensagem em português. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: string | undefined;

  constructor(code: ErrorCode, message: string, details?: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  toJSON(): AppErrorData {
    return this.details === undefined
      ? { code: this.code, message: this.message }
      : { code: this.code, message: this.message, details: this.details };
  }

  static from(data: AppErrorData): AppError {
    return new AppError(data.code, data.message, data.details);
  }
}

/** Converte issues do Zod numa mensagem legível em português. */
export function describeZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const where = issue.path.length ? issue.path.join('.') : 'valor';
      return `${where}: ${issue.message}`;
    })
    .join('; ');
}
