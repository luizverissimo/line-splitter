import { AppError, ipc } from '@line-splitter/shared';
import { detectEngine, detectPython } from '../engine/detect';
import { hasNvidiaGpu, type EngineInstaller } from '../engine/install';
import type { EnginePaths } from '../engine/paths';
import type { SettingsRepository } from '../settings/repository';

export function engineHandlers(settings: SettingsRepository, paths: EnginePaths, installer: EngineInstaller) {
  return {
    'engine:status': ipc.defineHandler('engine:status', () => detectEngine(settings.get(), paths)),
    'engine:install': ipc.defineHandler('engine:install', async ({ reinstall }) => {
      const python = await detectPython(settings.get().pythonPath);
      if (!python.ok || !python.path) throw new AppError('ENGINE_MISSING', python.detail);
      return installer.install({ reinstall, systemPython: python.path, cuda: await hasNvidiaGpu() });
    }),
    'engine:cancelInstall': ipc.defineHandler('engine:cancelInstall', () => ({
      cancelled: installer.cancel(),
    })),
  };
}
