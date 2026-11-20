import { MIN_PYTHON, type EngineDevice, type EngineStatus, type Settings } from '@line-splitter/shared';
import fs from 'node:fs';
import { z } from 'zod';
import path from 'node:path';
import { findInPath, run } from './exec';
import { HTDEMUCS_6S, type EnginePaths } from './paths';

type Item = { ok: boolean; detail: string };

export function parseVersion(text: string): number[] | null {
  const m = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(text);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : null;
}

const atLeast = (v: number[], min: readonly number[]) => {
  for (let i = 0; i < min.length; i += 1) {
    const a = v[i] ?? 0;
    const b = min[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
};

export async function detectPython(configured: string): Promise<Item & { path: string | null }> {
  const python =
    configured || findInPath(process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']);
  if (!python) {
    return { ok: false, path: null, detail: 'Python não encontrado no sistema.' };
  }
  if (configured && !fs.existsSync(configured)) {
    return { ok: false, path: configured, detail: `Python não encontrado em ${configured}.` };
  }
  const r = await run(python, ['-c', "import sys; print('%d.%d.%d' % sys.version_info[:3])"], {
    timeoutMs: 15_000,
  });
  const version = r.code === 0 ? parseVersion(r.stdout) : null;
  if (!version) {
    return {
      ok: false,
      path: python,
      detail: `Não foi possível executar ${python}: ${(r.error?.message ?? r.stderr).trim() || 'sem resposta'}`,
    };
  }
  const text = version.join('.');
  if (!atLeast(version, MIN_PYTHON)) {
    return {
      ok: false,
      path: python,
      detail: `Python ${text} encontrado; é necessário ${MIN_PYTHON.join('.')} ou mais novo.`,
    };
  }
  return { ok: true, path: python, detail: `Python ${text}` };
}

export async function detectFfmpeg(
  configured: string,
): Promise<Item & { path: string | null; ffprobePath: string | null }> {
  const ffmpeg = configured || findInPath(['ffmpeg']);
  if (!ffmpeg)
    return { ok: false, path: null, ffprobePath: null, detail: 'FFmpeg não encontrado no sistema.' };
  if (configured && !fs.existsSync(configured)) {
    return {
      ok: false,
      path: configured,
      ffprobePath: null,
      detail: `FFmpeg não encontrado em ${configured}.`,
    };
  }
  const r = await run(ffmpeg, ['-hide_banner', '-version'], { timeoutMs: 15_000 });
  const firstLine = r.stdout.split('\n')[0] ?? '';
  const version = /ffmpeg version (\S+)/.exec(firstLine)?.[1];
  if (r.code !== 0 || !version) {
    return {
      ok: false,
      path: ffmpeg,
      ffprobePath: null,
      detail: `Não foi possível executar ${ffmpeg}: ${(r.error?.message ?? r.stderr).trim() || 'sem resposta'}`,
    };
  }
  const ext = path.extname(ffmpeg);
  const sibling = path.join(path.dirname(ffmpeg), `ffprobe${ext}`);
  const ffprobe = fs.existsSync(sibling) ? sibling : findInPath(['ffprobe']);
  if (!ffprobe) {
    return {
      ok: false,
      path: ffmpeg,
      ffprobePath: null,
      detail: `FFmpeg ${version} encontrado, mas falta o ffprobe.`,
    };
  }
  const probe = await run(ffprobe, ['-hide_banner', '-version'], { timeoutMs: 15_000 });
  const probeVersion = /ffprobe version (\S+)/.exec(probe.stdout.split('\n')[0] ?? '')?.[1];
  if (probe.code !== 0 || !probeVersion) {
    const reason = (probe.error?.message ?? probe.stderr).trim() || 'sem resposta';
    return {
      ok: false,
      path: ffmpeg,
      ffprobePath: ffprobe,
      detail: `FFmpeg ${version} encontrado, mas o ffprobe em ${ffprobe} não executa: ${reason}`,
    };
  }
  return {
    ok: true,
    path: ffmpeg,
    ffprobePath: ffprobe,
    detail: `FFmpeg ${version} · ffprobe ${probeVersion}`,
  };
}

/** Resposta da sonda Python; validada porque vem de um processo externo. */
const torchInfoSchema = z.object({
  demucs: z.string().min(1),
  torch: z.string().min(1),
  cuda: z.boolean(),
  gpu: z.string().nullable(),
});
type TorchInfo = z.infer<typeof torchInfoSchema>;

const PROBE_SCRIPT = [
  'import json, demucs, torch',
  'cuda = torch.cuda.is_available()',
  "print(json.dumps({'demucs': demucs.__version__, 'torch': torch.__version__, 'cuda': cuda,",
  "  'gpu': torch.cuda.get_device_name(0) if cuda else None}))",
].join('\n');

export async function detectDemucs(paths: EnginePaths): Promise<Item & { torch: TorchInfo | null }> {
  if (!fs.existsSync(paths.venvPython)) {
    return { ok: false, torch: null, detail: 'Motor não instalado (ambiente Python do app ausente).' };
  }
  const r = await run(paths.venvPython, ['-c', PROBE_SCRIPT], {
    timeoutMs: 60_000,
    env: { ...process.env, TORCH_HOME: paths.torchHome, PYTHONNOUSERSITE: '1' },
  });
  if (r.code !== 0) {
    const missing = /No module named '(\w+)'/.exec(r.stderr)?.[1];
    return {
      ok: false,
      torch: null,
      detail: missing
        ? `Pacote "${missing}" não instalado no ambiente do motor.`
        : `Falha ao carregar o Demucs: ${(r.error?.message ?? r.stderr).trim().split('\n').pop() ?? 'erro desconhecido'}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout.trim().split('\n').pop() ?? '');
  } catch {
    parsed = null;
  }
  const info = torchInfoSchema.safeParse(parsed);
  if (!info.success) return { ok: false, torch: null, detail: 'Resposta inesperada ao verificar o Demucs.' };
  return { ok: true, torch: info.data, detail: `Demucs ${info.data.demucs} · PyTorch ${info.data.torch}` };
}

export function detectModel(paths: EnginePaths): Item {
  const weights = path.join(paths.modelsDir, HTDEMUCS_6S.file);
  const yamlFile = path.join(paths.modelsDir, HTDEMUCS_6S.yamlFile);
  let size: number;
  try {
    size = fs.statSync(weights).size;
  } catch {
    return { ok: false, detail: `Pesos do modelo ${HTDEMUCS_6S.name} não baixados.` };
  }
  if (size !== HTDEMUCS_6S.sizeBytes) {
    return { ok: false, detail: `Pesos do modelo ${HTDEMUCS_6S.name} incompletos; baixe de novo.` };
  }
  let yamlText: string;
  try {
    yamlText = fs.readFileSync(yamlFile, 'utf8');
  } catch {
    return { ok: false, detail: `Descrição do modelo ${HTDEMUCS_6S.name} ausente; baixe de novo.` };
  }
  if (yamlText !== HTDEMUCS_6S.yaml) {
    return { ok: false, detail: `Descrição do modelo ${HTDEMUCS_6S.name} alterada; baixe de novo.` };
  }
  return { ok: true, detail: `Modelo ${HTDEMUCS_6S.name} (${(size / 1024 / 1024).toFixed(0)} MB)` };
}

export function resolveDevice(preference: Settings['device'], torch: TorchInfo | null): EngineDevice {
  const cudaAvailable = torch?.cuda ?? false;
  const gpuName = torch?.gpu ?? null;
  if (preference === 'cpu') return { preference, effective: 'cpu', cudaAvailable, gpuName, warning: null };
  if (cudaAvailable) return { preference, effective: 'cuda', cudaAvailable, gpuName, warning: null };
  return {
    preference,
    effective: 'cpu',
    cudaAvailable,
    gpuName,
    warning:
      preference === 'cuda'
        ? torch
          ? 'GPU (CUDA) indisponível neste computador; a separação vai usar a CPU.'
          : 'Não foi possível verificar a GPU antes de instalar o motor; a separação vai usar a CPU.'
        : null,
  };
}

/** Situação completa do motor, item por item. */
export async function detectEngine(settings: Settings, paths: EnginePaths): Promise<EngineStatus> {
  const [python, ffmpeg, demucs] = await Promise.all([
    detectPython(settings.pythonPath),
    detectFfmpeg(settings.ffmpegPath),
    detectDemucs(paths),
  ]);
  const model = detectModel(paths);
  const { torch, ...demucsItem } = demucs;
  return {
    python,
    ffmpeg,
    demucs: demucsItem,
    model,
    device: resolveDevice(settings.device, torch),
    engineDir: paths.engineDir,
    ready: python.ok && ffmpeg.ok && demucs.ok && model.ok,
  };
}
