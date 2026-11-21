import { defineConfig } from '@playwright/test';

// Teste de fumaça do app EMPACOTADO (release/), separado da suíte E2E normal: roda depois de `pnpm dist:linux`.
export default defineConfig({
  testDir: './e2e-pacote',
  globalSetup: './e2e/global-setup.ts',
  timeout: 15 * 60_000,
  expect: { timeout: 30_000 },
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  outputDir: 'e2e-results/pacote',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
