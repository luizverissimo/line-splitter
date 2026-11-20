import { generateFixtures } from '../scripts/fixtures.mjs';

/** Gera os áudios de teste com o FFmpeg real antes dos E2E (mesma origem dos testes do desktop). */
export default function globalSetup(): void {
  generateFixtures({ long: true });
}
