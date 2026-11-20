import { AppError } from '@line-splitter/shared';
import { QueryClient } from '@tanstack/react-query';

/** Erros de validação/contrato não melhoram com nova tentativa; os demais tentam uma vez a mais. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(
            error instanceof AppError && ['VALIDATION', 'INVALID_RESPONSE', 'INTERNAL'].includes(error.code)
          ) && failureCount < 1,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
