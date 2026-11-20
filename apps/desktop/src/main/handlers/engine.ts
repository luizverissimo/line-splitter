import { ipc } from '@line-splitter/shared';
import { detectEngine } from '../engine/detect';
import type { EnginePaths } from '../engine/paths';
import type { SettingsRepository } from '../settings/repository';

export function engineHandlers(settings: SettingsRepository, paths: EnginePaths) {
  return {
    'engine:status': ipc.defineHandler('engine:status', () => detectEngine(settings.get(), paths)),
  };
}
