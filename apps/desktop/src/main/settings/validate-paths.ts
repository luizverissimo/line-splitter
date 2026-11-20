import { AppError, type SettingsUpdate } from '@line-splitter/shared';
import fs from 'node:fs';
import path from 'node:path';

function isWritableDir(dir: string): boolean {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Pasta existente e gravável, ou inexistente com o ancestral existente mais próximo gravável (será criada). */
export function checkOutputDir(dir: string): string | null {
  if (fs.existsSync(dir)) {
    if (!fs.statSync(dir).isDirectory()) return 'O caminho escolhido para saída é um arquivo, não uma pasta.';
    return isWritableDir(dir) ? null : 'Sem permissão de escrita na pasta de saída.';
  }
  let parent = path.dirname(dir);
  while (!fs.existsSync(parent) && path.dirname(parent) !== parent) parent = path.dirname(parent);
  return isWritableDir(parent) ? null : 'Não é possível criar a pasta de saída nesse local (sem permissão).';
}

/** Arquivo existente e executável. */
export function checkExecutable(file: string, label: string): string | null {
  try {
    if (!fs.statSync(file).isFile()) return `${label}: o caminho não é um arquivo.`;
  } catch {
    return `${label}: arquivo não encontrado.`;
  }
  try {
    fs.accessSync(file, process.platform === 'win32' ? fs.constants.R_OK : fs.constants.X_OK);
    return null;
  } catch {
    return `${label}: o arquivo não tem permissão de execução.`;
  }
}

/** Validação no processo principal do que o schema não consegue saber: o que existe no disco. */
export function validateSettingsPaths(patch: SettingsUpdate): void {
  const problems: string[] = [];
  if (patch.outputDir !== undefined) {
    const p = checkOutputDir(patch.outputDir);
    if (p) problems.push(p);
  }
  if (patch.pythonPath) {
    const p = checkExecutable(patch.pythonPath, 'Python');
    if (p) problems.push(p);
  }
  if (patch.ffmpegPath) {
    const p = checkExecutable(patch.ffmpegPath, 'FFmpeg');
    if (p) problems.push(p);
  }
  if (problems.length) throw new AppError('VALIDATION', problems.join(' '));
}
