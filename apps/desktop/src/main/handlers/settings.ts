import { ipc } from '@line-splitter/shared';
import type { SettingsRepository } from '../settings/repository';
import { validateSettingsPaths } from '../settings/validate-paths';

export function settingsHandlers(repo: SettingsRepository) {
  return {
    'settings:get': ipc.defineHandler('settings:get', () => repo.get()),
    'settings:update': ipc.defineHandler('settings:update', (patch) => {
      validateSettingsPaths(patch);
      return repo.update(patch);
    }),
  };
}
