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
} as const;
