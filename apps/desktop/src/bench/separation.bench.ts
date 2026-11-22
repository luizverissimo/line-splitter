// Benchmark de desempenho (RNF-06, DEC-017): separa um áudio de 4 min, instrumento por instrumento, em GPU
// e em CPU com o motor real e os modelos de cada instrumento, e imprime os tempos. Rodar com `pnpm bench`.
import { instrumentOf, STEMS, type Settings, type Stem } from '@line-splitter/shared';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensureTestEngine } from '../../../../e2e/engine-fixture';
import { fixtures } from '../../../../scripts/fixtures.mjs';
import { openDatabase, type Db } from '../main/db/database';
import { detectEngine, detectPython } from '../main/engine/detect';
import { EngineInstaller, hasNvidiaGpu } from '../main/engine/install';
import { ModelDownloader } from '../main/engine/model';
import { enginePaths, modelForStem, type EnginePaths } from '../main/engine/paths';
import { HistoryRepository } from '../main/history/repository';
import { MediaRegistry } from '../main/media/registry';
import { SeparationService } from '../main/separation/service';

/** Motor com PyTorch CUDA, instalado pelo próprio instalador do app (fica em cache entre execuções). */
const CUDA_ENGINE_ROOT = path.join(os.tmpdir(), 'line-splitter-bench-engine-cuda');
const REFERENCE_S = { cuda: 120, cpu: 600 };

async function ensureCudaEngine(): Promise<EnginePaths> {
  const paths = enginePaths(CUDA_ENGINE_ROOT);
  const settings = {
    outputDir: os.tmpdir(),
    bitrateKbps: 320,
    device: 'cuda',
    pythonPath: '',
    ffmpegPath: '',
  } as const;
  const status = await detectEngine(settings, paths);
  if (!status.separator.ok || !status.device.cudaAvailable) {
    const python = await detectPython('');
    if (!python.path) throw new Error(python.detail);
    await new EngineInstaller(paths, { step: () => undefined, log: () => undefined }).install({
      reinstall: true,
      target: { systemPython: python.path, cuda: true },
    });
  }
  if (!status.model.ok) await new ModelDownloader(paths, () => undefined).download();
  const after = await detectEngine(settings, paths);
  if (!after.ready || after.device.effective !== 'cuda') {
    throw new Error(`Motor CUDA do benchmark não ficou pronto: ${JSON.stringify(after)}`);
  }
  return paths;
}

describe('benchmark: música de 4 min', () => {
  let work: string;
  let db: Db;
  let input: string;
  const results: string[] = [];

  beforeAll(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-bench-'));
    db = openDatabase(path.join(work, 'dados'));
    // 4 min: o clipe de teste (sintético, livre de direitos — DEC-005) repetido 30 vezes.
    input = path.join(work, 'musica-4min.wav');
    const r = spawnSync('ffmpeg', [
      '-v',
      'error',
      '-y',
      '-stream_loop',
      '29',
      '-i',
      fixtures.wav,
      '-c',
      'copy',
      input,
    ]);
    if (r.status !== 0) throw new Error(`ffmpeg falhou: ${r.stderr.toString()}`);
  });
  afterAll(() => {
    db.close();
    fs.rmSync(work, { recursive: true, force: true });
    // O Vitest captura o console; o resultado vai para um arquivo que o `pnpm bench` imprime no fim.
    fs.writeFileSync(
      path.join(path.dirname(fixtures.wav), 'benchmark.md'),
      `## Resultado do benchmark (${new Date().toISOString()})\n${results.join('\n')}\n`,
    );
  });

  async function measure(label: 'cuda' | 'cpu', paths: EnginePaths, stem: Stem) {
    const settings: Settings = {
      outputDir: path.join(work, `saida-${label}`),
      bitrateKbps: 320,
      device: label,
      pythonPath: '',
      ffmpegPath: '',
    };
    const service = new SeparationService({
      paths,
      settings: () => settings,
      history: new HistoryRepository(db),
      media: new MediaRegistry(),
      currentInput: () => input,
      onProgress: () => undefined,
      tmpRoot: work,
    });
    const result = await service.run(stem);
    expect(result.device).toBe(label);
    expect(result.model).toBe(modelForStem(stem).name);
    const seconds = result.processingMs / 1000;
    const verdict =
      seconds <= REFERENCE_S[label]
        ? 'dentro da referência do PRD'
        : 'ACIMA da referência do PRD (custo aceito na DEC-017)';
    results.push(
      `- ${label === 'cuda' ? 'GPU (CUDA)' : 'CPU'} · ${instrumentOf(stem).label} (${result.model}): ${seconds.toFixed(1)} s para 4:00 de áudio (referência: ~${REFERENCE_S[label] / 60} min) → ${verdict}`,
    );
    return seconds;
  }

  it.runIf(process.platform === 'linux' || process.platform === 'win32')(
    'GPU (CUDA)',
    async () => {
      if (!(await hasNvidiaGpu())) {
        results.push('- GPU (CUDA): sem GPU NVIDIA nesta máquina; medição não realizada');
        return;
      }
      const paths = await ensureCudaEngine();
      for (const stem of STEMS) expect(await measure('cuda', paths, stem)).toBeGreaterThan(0);
    },
    3 * 60 * 60_000,
  );

  it(
    'CPU',
    async () => {
      const paths = enginePaths(path.dirname(await ensureTestEngine()));
      for (const stem of STEMS) expect(await measure('cpu', paths, stem)).toBeGreaterThan(0);
    },
    4 * 60 * 60_000,
  );
});
