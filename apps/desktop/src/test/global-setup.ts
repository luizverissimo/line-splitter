import { generateFixtures } from '../../../../scripts/fixtures.mjs';

/** Gera os áudios de teste com o FFmpeg real antes da suíte do desktop. */
export default function setup(): void {
  generateFixtures({ long: true });
}
