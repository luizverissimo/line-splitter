import { defineConfig } from 'vitest/config';

// Configuração separada: o benchmark é lento e não entra no `pnpm test`/`pnpm verify`.
export default defineConfig({
  test: {
    include: ['src/bench/**/*.bench.ts'],
    globalSetup: ['src/test/global-setup.ts'],
    testTimeout: 60 * 60_000,
    hookTimeout: 60 * 60_000,
  },
});
