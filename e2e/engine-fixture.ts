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
 * Prepara a pasta de modelos de um teste para o download pela interface sem repetir 1,5 GB: os pesos do
 * BS-Roformer-SW são ligados do motor de teste, e os do modelo de voz começam de um `.parcial` com tudo menos
 * os últimos `missingBytes` — o app baixa o resto de verdade, do espelho oficial, com HTTP Range. As
 * configurações (.yaml) também são baixadas pelo app.
 */
export async function seedPartialModels(userData: string, missingBytes = 40 * 1024 * 1024): Promise<string> {
  const source = path.join(await ensureTestEngine(), 'models');
  const target = path.join(userData, 'engine', 'models');
  fs.mkdirSync(target, { recursive: true });
  fs.symlinkSync(path.join(source, 'BS-Roformer-SW.ckpt'), path.join(target, 'BS-Roformer-SW.ckpt'));
  const vocals = 'mel_band_roformer_kim_ft2_bleedless_unwa.ckpt';
  const partial = path.join(target, `${vocals}.parcial`);
  const size = fs.statSync(path.join(source, vocals)).size;
  const input = fs.openSync(path.join(source, vocals), 'r');
  const output = fs.openSync(partial, 'w');
  try {
    const buf = Buffer.alloc(8 * 1024 * 1024);
    for (let pos = 0; pos < size - missingBytes;) {
      const n = fs.readSync(input, buf, 0, Math.min(buf.length, size - missingBytes - pos), pos);
      fs.writeSync(output, buf, 0, n);
      pos += n;
    }
  } finally {
    fs.closeSync(input);
    fs.closeSync(output);
  }
  return partial;
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
