// Tipos dos matchers do jest-dom para o Vitest 4 (a declaração do pacote ainda usa a forma do Vitest 3).
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

declare module 'vitest' {
  interface Matchers<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
}
