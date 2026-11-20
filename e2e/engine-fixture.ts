import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectEngine, detectPython } from '../apps/desktop/src/main/engine/detect';
import { EngineInstaller } from '../apps/desktop/src/main/engine/install';
import { ModelDownloader } from '../apps/desktop/src/main/engine/model';
import { enginePaths } from '../apps/desktop/src/main/engine/paths';

/**
 * Motor real para os E2E que precisam separar áudio: instalado uma vez pelo próprio instalador do app
 * (variante CPU, ~1 GB) e com o modelo baixado do servidor oficial. Fica numa pasta persistente e é
 * ligado à pasta de dados de cada teste por um link simbólico.
 */
export const TEST_ENGINE_ROOT = path.join(os.tmpdir(), 'line-splitter-e2e-engine');

export async function ensureTestEngine(): Promise<string> {
  const paths = enginePaths(TEST_ENGINE_ROOT);
  const settings = {
    outputDir: os.tmpdir(),
    bitrateKbps: 320,
    device: 'cpu',
    pythonPath: '',
    ffmpegPath: '',
  } as const;
  const status = await detectEngine(settings, paths);
  if (!status.demucs.ok) {
    const python = await detectPython('');
    if (!python.path) throw new Error(`E2E do motor exigem Python no PATH: ${python.detail}`);
    await new EngineInstaller(paths, { step: () => undefined, log: () => undefined }).install({
      reinstall: true,
      systemPython: python.path,
      cuda: false,
    });
  }
  if (!status.model.ok) await new ModelDownloader(paths, () => undefined).download();
  const after = await detectEngine(settings, paths);
  if (!after.ready) throw new Error(`Motor de teste incompleto: ${JSON.stringify(after)}`);
  return paths.engineDir;
}

/** Liga o motor de teste à pasta de dados de um teste. */
export function linkTestEngine(userData: string, engineDir: string): void {
  fs.mkdirSync(userData, { recursive: true });
  fs.symlinkSync(engineDir, path.join(userData, 'engine'), 'dir');
}
