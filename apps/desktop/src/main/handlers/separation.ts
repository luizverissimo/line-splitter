import { ipc } from '@line-splitter/shared';
import type { SeparationService } from '../separation/service';

export function separationHandlers(service: SeparationService) {
  return {
    'separation:start': ipc.defineHandler('separation:start', ({ stem }) => service.run(stem)),
    'separation:cancel': ipc.defineHandler('separation:cancel', () => ({ cancelled: service.cancel() })),
  };
}
