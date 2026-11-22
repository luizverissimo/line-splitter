import type { Stem } from '@line-splitter/shared';
import path from 'node:path';

/** Pastas do motor gerenciado pelo app, todas dentro da pasta de dados do usuário. */
export interface EnginePaths {
  engineDir: string;
  venvDir: string;
  venvPython: string;
  /** TORCH_HOME do motor (cache do PyTorch isolado do usuário). */
  torchHome: string;
  /** Repositório local de modelos passado ao Demucs com `--repo` (yaml do modelo + pesos .th). */
  modelsDir: string;
}

export function enginePaths(userDataDir: string, platform: NodeJS.Platform = process.platform): EnginePaths {
  const engineDir = path.join(userDataDir, 'engine');
  const venvDir = path.join(engineDir, 'venv');
  const venvPython =
    platform === 'win32' ? path.join(venvDir, 'Scripts', 'python.exe') : path.join(venvDir, 'bin', 'python');
  const torchHome = path.join(engineDir, 'torch');
  return {
    engineDir,
    venvDir,
    venvPython,
    torchHome,
    modelsDir: path.join(engineDir, 'models'),
  };
}

/**
 * Modelo `htdemucs_6s` (6 fontes: vocals, drums, bass, guitar, piano, other).
 * O Demucs nomeia o arquivo `<assinatura>-<8 primeiros hex do SHA-256>.th` e descreve o modelo num yaml.
 * Rodando com `--repo <modelsDir>`, o Demucs carrega tudo localmente, sem rede (DEC-011).
 */
export const HTDEMUCS_6S = {
  name: 'htdemucs_6s',
  yamlFile: 'htdemucs_6s.yaml',
  yaml: "models: ['5c90dfd2']\n",
  file: '5c90dfd2-34c22ccb.th',
  sizeBytes: 54_996_327,
  url: 'https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/5c90dfd2-34c22ccb.th',
  sha256Prefix: '34c22ccb',
  /** SHA-256 completo do arquivo oficial (conferido no download real). */
  sha256: '34c22ccb381c6f9fdbf324f04e1e2fe21aaaf293f5ded163a162697ff9a02ddd',
} as const;

/** Um arquivo de modelo baixado da internet, conferido por tamanho e SHA-256. */
export interface ModelFile {
  file: string;
  url: string;
  sizeBytes: number;
  sha256: string;
}

/** Modelo de separação: arquivos baixados e, se preciso, arquivos gerados localmente (ex.: yaml do Demucs). */
export interface SeparationModel {
  id: string;
  name: string;
  stems: readonly Stem[];
  files: readonly ModelFile[];
  generated?: readonly { file: string; content: string }[];
}

/** Espelho oficial dos modelos do audio-separator (DEC-017). */
const AUDIO_SEPARATOR_MIRROR =
  'https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs';

/** Voz: MelBand-RoFormer Kim FT2 Bleedless (o que menos vaza o resto da música; DEC-017). */
export const VOCALS_MODEL: SeparationModel = {
  id: 'melband-kim-ft2-bleedless',
  name: 'MelBand-RoFormer Kim FT2 Bleedless',
  stems: ['vocals'],
  files: [
    {
      file: 'mel_band_roformer_kim_ft2_bleedless_unwa.ckpt',
      url: `${AUDIO_SEPARATOR_MIRROR}/mel_band_roformer_kim_ft2_bleedless_unwa.ckpt`,
      sizeBytes: 913_101_368,
      sha256: '3c450bd66a98b49dd03231fc5ebb84121eef8418236b179423c2b171d62b04d9',
    },
    {
      file: 'config_mel_band_roformer_kim_ft_unwa.yaml',
      url: `${AUDIO_SEPARATOR_MIRROR}/config_mel_band_roformer_kim_ft_unwa.yaml`,
      sizeBytes: 1_721,
      sha256: 'c910a0b1493fd3f9cee7a576a7498e44e660510dcaaf5d0d50d5363dde1d0010',
    },
  ],
};

/** Bateria, baixo, guitarra e piano: BS-Roformer-SW (6 fontes; DEC-017). */
export const INSTRUMENTS_MODEL: SeparationModel = {
  id: 'bs-roformer-sw',
  name: 'BS-Roformer-SW',
  stems: ['drums', 'bass', 'guitar', 'piano'],
  files: [
    {
      file: 'BS-Roformer-SW.ckpt',
      url: `${AUDIO_SEPARATOR_MIRROR}/BS-Roformer-SW.ckpt`,
      sizeBytes: 699_412_152,
      sha256: '24e7d35ee9c64415673d3fd33e06a67cac2c103c5df6267ba1576459c775916e',
    },
    {
      file: 'BS-Roformer-SW.yaml',
      url: `${AUDIO_SEPARATOR_MIRROR}/BS-Roformer-SW.yaml`,
      sizeBytes: 4_653,
      sha256: 'b558996f1e25eb48798bd6502505a5de94c4f966d6edfb1a0420f06cc40b501a',
    },
  ],
};

/** O htdemucs_6s, ainda usado pela separação até a troca do motor (T-905). */
export const LEGACY_DEMUCS_MODEL: SeparationModel = {
  id: HTDEMUCS_6S.name,
  name: HTDEMUCS_6S.name,
  stems: ['vocals', 'drums', 'bass', 'guitar', 'piano'],
  files: [
    {
      file: HTDEMUCS_6S.file,
      url: HTDEMUCS_6S.url,
      sizeBytes: HTDEMUCS_6S.sizeBytes,
      sha256: HTDEMUCS_6S.sha256,
    },
  ],
  generated: [{ file: HTDEMUCS_6S.yamlFile, content: HTDEMUCS_6S.yaml }],
};

/** Todos os modelos que o motor precisa baixados. */
export const SEPARATION_MODELS: readonly SeparationModel[] = [
  VOCALS_MODEL,
  INSTRUMENTS_MODEL,
  LEGACY_DEMUCS_MODEL,
];

export const modelSizeBytes = (model: SeparationModel): number =>
  model.files.reduce((sum, f) => sum + f.sizeBytes, 0);
