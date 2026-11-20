import fs from 'node:fs';
import path from 'node:path';

/** Remove caracteres proibidos em nomes de arquivo no Windows/Linux, mantendo acentos e espaços. */
export function safeFileName(name: string): string {
  // Caracteres de controle (código < 32) também são proibidos no Windows.
  const noControl = Array.from(name, (ch) => (ch.charCodeAt(0) < 32 ? '_' : ch)).join('');
  const cleaned = noControl
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/, '')
    .trim();
  return cleaned || 'audio';
}

/** Caminho livre em `dir` para `base.ext`, acrescentando " (2)", " (3)"… se já existir (RN-09). */
export function uniquePath(dir: string, base: string, ext: string, taken: Set<string> = new Set()): string {
  for (let n = 1; ; n += 1) {
    const candidate = path.join(dir, `${base}${n === 1 ? '' : ` (${n})`}.${ext}`);
    if (!fs.existsSync(candidate) && !taken.has(candidate)) return candidate;
  }
}

/** Nomes das duas saídas: "<nome> - <Instrumento>.mp3" e "<nome> - sem <Instrumento>.mp3". */
export function outputPaths(dir: string, sourceName: string, instrumentLabel: string) {
  const base = safeFileName(sourceName);
  const instrument = uniquePath(dir, `${base} - ${instrumentLabel}`, 'mp3');
  const rest = uniquePath(dir, `${base} - sem ${instrumentLabel}`, 'mp3', new Set([instrument]));
  return { instrument, rest };
}

/** Lê a porcentagem da barra de progresso do Demucs (tqdm), ex.: " 50%|█████     | 5.85/11.7 [...]". */
export function parseDemucsProgress(chunk: string): number | null {
  let last: number | null = null;
  for (const m of chunk.matchAll(/(\d{1,3})%\|/g)) last = Number(m[1]);
  return last !== null && last >= 0 && last <= 100 ? last : null;
}
