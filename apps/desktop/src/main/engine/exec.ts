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

/** Procura um executável nas pastas do PATH (com PATHEXT no Windows). */
export function findInPath(
  names: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter(Boolean);
  const exts =
    platform === 'win32' ? (env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').map((e) => e.toLowerCase()) : [''];
  for (const dir of dirs) {
    for (const name of names) {
      for (const ext of exts) {
        const candidate = path.join(dir, name + ext);
        try {
          const stat = fs.statSync(candidate);
          if (!stat.isFile()) continue;
          if (platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
          return candidate;
        } catch {
          continue;
        }
      }
    }
  }
  return null;
}
