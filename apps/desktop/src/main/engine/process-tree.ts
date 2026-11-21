import { spawn, type ChildProcess } from 'node:child_process';

/**
 * Inicia um processo filho num grupo próprio (Linux/macOS) para que cancelar encerre também os netos
 * (pip compila/descompacta em subprocessos; o Demucs usa workers).
 */
export function spawnTree(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(command, args, {
    shell: false,
    windowsHide: true,
    detached: process.platform !== 'win32',
    env,
  });
}

/** Encerra o processo e todos os descendentes. */
export function killTree(child: ChildProcess): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}
