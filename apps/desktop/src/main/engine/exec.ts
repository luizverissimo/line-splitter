import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error: Error | null;
}

/** Executa um programa sem shell, com tempo limite, e devolve a saída (nunca lança). */
export function run(
  command: string,
  args: string[],
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: options.env ?? process.env,
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(null, new Error(`Tempo esgotado ao executar ${path.basename(command)}`));
    }, options.timeoutMs ?? 30_000);
    function finish(code: number | null, error: Error | null) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, error });
    }
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (err) => finish(null, err));
    child.on('close', (code) => finish(code, null));
  });
}

/**
 * Atalhos de "App Execution Alias" do Windows (python.exe em ...\Microsoft\WindowsApps) abrem a
 * Microsoft Store em vez de executar o Python; nunca são candidatos.
 */
function isWindowsAppsAlias(dir: string): boolean {
  return /[\\/]Microsoft[\\/]WindowsApps[\\/]?$/i.test(dir);
}

/** Todos os executáveis com esses nomes nas pastas do PATH, na ordem de busca (com PATHEXT no Windows). */
export function findAllInPath(
  names: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const dirs = (env.PATH ?? env.Path ?? '')
    .split(platform === 'win32' ? ';' : path.delimiter)
    .filter(Boolean)
    .filter((dir) => platform !== 'win32' || !isWindowsAppsAlias(dir));
  const exts =
    platform === 'win32'
      ? (env.PATHEXT ?? '.EXE;.CMD;.BAT')
          .split(';')
          .filter(Boolean)
          .map((e) => e.toLowerCase())
      : [''];
  const found: string[] = [];
  // Por nome primeiro: "python" em qualquer pasta vence "py" (mesma ordem de preferência da lista).
  for (const name of names) {
    for (const dir of dirs) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        try {
          if (!fs.statSync(candidate).isFile()) continue;
          // No Windows não existe bit de execução: a extensão do PATHEXT é o que conta.
          if (platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
          if (!found.includes(candidate)) found.push(candidate);
        } catch {
          continue;
        }
      }
    }
  }
  return found;
}

/** Primeiro executável encontrado no PATH (ver findAllInPath). */
export function findInPath(
  names: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  return findAllInPath(names, env, platform)[0] ?? null;
}
