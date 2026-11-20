import { AppError } from '@line-splitter/shared';

/** Mensagem legível para qualquer erro que chegue à UI. */
export function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Ocorreu um erro inesperado.';
}

export function errorDetails(error: unknown): string | undefined {
  if (error instanceof AppError) return error.details;
  if (error instanceof Error) return error.stack;
  return undefined;
}
