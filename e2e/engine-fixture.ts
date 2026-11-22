import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectEngine, detectPython } from '../apps/desktop/src/main/engine/detect';
import { EngineInstaller } from '../apps/desktop/src/main/engine/install';
import { ModelDownloader } from '../apps/desktop/src/main/engine/model';
import { enginePaths } from '../apps/desktop/src/main/engine/paths';

/**
 * Motor real para os E2E que precisam separar áudio: instalado uma vez pelo próprio instalador do app
 * (variante CPU, alguns GB) e com os modelos baixados das fontes oficiais (~1,7 GB). Fica numa pasta persistente e é
 * ligado à pasta de dados de cada teste por um link simbólico.
 */
export const TEST_ENGINE_ROOT = path.join(os.tmpdir(), 'line-splitter-e2e-engine');

/**
 * Trava entre processos (os arquivos de teste rodam em paralelo): só um instala o motor ou baixa os modelos
 * por vez. Uma trava deixada por um processo que morreu é descartada.
 */
async function withEngineLock<T>(work: () => Promise<T>): Promise<T> {
  const lock = `${TEST_ENGINE_ROOT}.trava`;
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  for (;;) {
    try {
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      let owner = 0;
      try {
        owner = Number(fs.readFileSync(path.join(lock, 'pid'), 'utf8'));
      } catch {
        owner = 0;
      }
      let alive = false;
      if (owner > 0) {
        try {
          process.kill(owner, 0);
          alive = true;
        } catch {
          alive = false;
        }
      }
      const age = Date.now() - fs.statSync(lock).mtimeMs;
      if (!alive && (owner > 0 || age > 10_000)) fs.rmSync(lock, { recursive: true, force: true });
      else await new Promise((r) => setTimeout(r, 1000));
    }
  }
  try {
    return await work();
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

export async function ensureTestEngine(): Promise<string> {
  return withEngineLock(prepareTestEngine);
}

async function prepareTestEngine(): Promise<string> {
  const paths = enginePaths(TEST_ENGINE_ROOT);
  const settings = {
    outputDir: os.tmpdir(),
    bitrateKbps: 320,
    device: 'cpu',
    pythonPath: '',
    ffmpegPath: '',
  } as const;
  const status = await detectEngine(settings, paths);
  if (!status.separator.ok) {
    const python = await detectPython('');
    if (!python.path) throw new Error(`E2E do motor exigem Python no PATH: ${python.detail}`);
    await new EngineInstaller(paths, { step: () => undefined, log: () => undefined }).install({
      reinstall: true,
      target: { systemPython: python.path, cuda: false },
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

/**
 * Liga à pasta de dados do teste só os pesos grandes dos RoFormer (~1,5 GB) já baixados no motor de teste,
 * para que o download pela interface baixe de verdade o resto (configurações e htdemucs_6s) sem repetir 1,5 GB.
 */
export async function seedLargeModels(userData: string): Promise<string[]> {
  const source = path.join(await ensureTestEngine(), 'models');
  const target = path.join(userData, 'engine', 'models');
  fs.mkdirSync(target, { recursive: true });
  const seeded = fs.readdirSync(source).filter((f) => f.endsWith('.ckpt'));
  for (const f of seeded) fs.symlinkSync(path.join(source, f), path.join(target, f));
  return seeded;
}

/**
 * Liga à pasta de dados do teste todos os arquivos de modelo do motor de teste, menos os indicados
 * (que o teste cria por conta própria, por exemplo corrompidos).
 */
export async function linkModelsExcept(userData: string, except: string[]): Promise<void> {
  const source = path.join(await ensureTestEngine(), 'models');
  const target = path.join(userData, 'engine', 'models');
  fs.mkdirSync(target, { recursive: true });
  for (const f of fs.readdirSync(source)) {
    if (!except.includes(f)) fs.symlinkSync(path.join(source, f), path.join(target, f));
  }
}
