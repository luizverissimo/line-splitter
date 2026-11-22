import {
  formatBytes,
  instrumentOf,
  MAX_PYTHON,
  MIN_PYTHON,
  type EngineDevice,
  type EngineModel,
  type EngineStatus,
  type Settings,
} from '@line-splitter/shared';
import fs from 'node:fs';
import { z } from 'zod';
import path from 'node:path';
import { findAllInPath, findInPath, run } from './exec';
import { generatedFilesPresent, modelFilePresent } from './model';
import { modelSizeBytes, SEPARATION_MODELS, type EnginePaths, type SeparationModel } from './paths';

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

export interface DetectOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
}

/** Roda o Python e confere a versão mínima. */
async function probePython(python: string): Promise<Item & { path: string | null }> {
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
  const [major = 0, minor = 0] = version;
  const tooNew = major > MAX_PYTHON[0] || (major === MAX_PYTHON[0] && minor > MAX_PYTHON[1]);
  if (!atLeast(version, MIN_PYTHON) || tooNew) {
    return {
      ok: false,
      path: python,
      detail: `Python ${text} encontrado; o motor (PyTorch 2.6 e audio-separator) precisa do Python ${MIN_PYTHON.join('.')} a ${MAX_PYTHON.join('.')}.`,
    };
  }
  return { ok: true, path: python, detail: `Python ${text}` };
}

/**
 * Python do sistema: o configurado ou, sem configuração, cada candidato do PATH em ordem
 * (Windows: `python` e depois o lançador `py`; Linux/macOS: `python3` e depois `python`)
 * até um funcionar. Sem nenhum funcionando, explica a falha do primeiro.
 */
export async function detectPython(
  configured: string,
  options: DetectOptions = {},
): Promise<Item & { path: string | null }> {
  const platform = options.platform ?? process.platform;
  if (configured) {
    if (!fs.existsSync(configured)) {
      return { ok: false, path: configured, detail: `Python não encontrado em ${configured}.` };
    }
    return probePython(configured);
  }
  const candidates = findAllInPath(
    platform === 'win32' ? ['python', 'py'] : ['python3', 'python'],
    options.env ?? process.env,
    platform,
  );
  if (candidates.length === 0) {
    return { ok: false, path: null, detail: 'Python não encontrado no sistema.' };
  }
  let first: (Item & { path: string | null }) | null = null;
  for (const candidate of candidates) {
    const result = await probePython(candidate);
    if (result.ok) return result;
    first ??= result;
  }
  return first ?? { ok: false, path: null, detail: 'Python não encontrado no sistema.' };
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
  separator: z.string().min(1),
  torch: z.string().min(1),
  cuda: z.boolean(),
  gpu: z.string().nullable(),
});
type TorchInfo = z.infer<typeof torchInfoSchema>;

/**
 * Importa o que a separação usa (audio-separator, PyTorch e, até a troca do motor na T-905, o Demucs)
 * e informa versões e GPU.
 */
const PROBE_SCRIPT = [
  'import json, importlib.metadata as md, importlib.util',
  // Primeiro o separador: num motor antigo (ou incompleto) é ele que falta, e a mensagem tem de dizer isso.
  "if importlib.util.find_spec('audio_separator') is None: raise ModuleNotFoundError(\"No module named 'audio_separator'\")",
  'import torch, numpy, demucs',
  'import audio_separator.separator',
  'cuda = torch.cuda.is_available()',
  "print(json.dumps({'separator': md.version('audio-separator'), 'torch': torch.__version__, 'cuda': cuda,",
  "  'gpu': torch.cuda.get_device_name(0) if cuda else None}))",
].join('\n');

export async function detectSeparator(paths: EnginePaths): Promise<Item & { torch: TorchInfo | null }> {
  if (!fs.existsSync(paths.venvPython)) {
    return { ok: false, torch: null, detail: 'Motor não instalado (ambiente Python do app ausente).' };
  }
  const r = await run(paths.venvPython, ['-c', PROBE_SCRIPT], {
    timeoutMs: 120_000,
    env: { ...process.env, TORCH_HOME: paths.torchHome, PYTHONNOUSERSITE: '1' },
  });
  if (r.code !== 0) {
    const missing = /No module named '([\w.]+)'/.exec(r.stderr)?.[1];
    if (missing?.startsWith('audio_separator')) {
      return {
        ok: false,
        torch: null,
        detail:
          'O separador (audio-separator) não está instalado no ambiente do motor. Clique em "Instalar motor" para instalar ou atualizar.',
      };
    }
    return {
      ok: false,
      torch: null,
      detail: missing
        ? `Pacote "${missing}" não instalado no ambiente do motor. Clique em "Instalar motor" para corrigir.`
        : `Falha ao carregar o separador: ${(r.error?.message ?? r.stderr).trim().split('\n').pop() ?? 'erro desconhecido'}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(r.stdout.trim().split('\n').pop() ?? '');
  } catch {
    parsed = null;
  }
  const info = torchInfoSchema.safeParse(parsed);
  if (!info.success)
    return { ok: false, torch: null, detail: 'Resposta inesperada ao verificar o separador.' };
  return {
    ok: true,
    torch: info.data,
    detail: `audio-separator ${info.data.separator} · PyTorch ${info.data.torch}`,
  };
}

/** Cada modelo de separação: baixado com o tamanho certo (e arquivos gerados íntegros)? */
export function detectModels(
  paths: EnginePaths,
  models: readonly SeparationModel[] = SEPARATION_MODELS,
): EngineModel[] {
  return models.map((model) => {
    const sizeBytes = modelSizeBytes(model);
    const missing = model.files.filter((f) => !modelFilePresent(paths.modelsDir, f));
    const base = {
      id: model.id,
      name: model.name,
      instruments: model.stems.map((s) => instrumentOf(s).label),
      sizeBytes,
    };
    const size = formatBytes(sizeBytes);
    if (missing.length === model.files.length)
      return { ...base, ok: false, detail: `Não baixado (${size}).` };
    if (missing.length > 0) {
      return { ...base, ok: false, detail: `Download incompleto (${size}); baixe de novo.` };
    }
    if (!generatedFilesPresent(paths.modelsDir, model)) {
      return {
        ...base,
        ok: false,
        detail: `Arquivo de descrição ausente ou alterado (${size}); baixe de novo.`,
      };
    }
    return { ...base, ok: true, detail: `Baixado (${formatBytes(sizeBytes)})` };
  });
}

/** Resumo de todos os modelos num item só. */
export function summarizeModels(models: readonly EngineModel[]): Item {
  const missing = models.filter((m) => !m.ok);
  if (missing.length === 0) return { ok: true, detail: `${models.length} modelos baixados.` };
  const total = missing.reduce((sum, m) => sum + m.sizeBytes, 0);
  return {
    ok: false,
    detail: `Falta baixar: ${missing.map((m) => m.name).join(', ')} (${formatBytes(total)}).`,
  };
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
  const [python, ffmpeg, separator] = await Promise.all([
    detectPython(settings.pythonPath),
    detectFfmpeg(settings.ffmpegPath),
    detectSeparator(paths),
  ]);
  const models = detectModels(paths);
  const model = summarizeModels(models);
  const { torch, ...separatorItem } = separator;
  return {
    python,
    ffmpeg,
    separator: separatorItem,
    model,
    models,
    device: resolveDevice(settings.device, torch),
    engineDir: paths.engineDir,
    ready: python.ok && ffmpeg.ok && separator.ok && model.ok,
  };
}
