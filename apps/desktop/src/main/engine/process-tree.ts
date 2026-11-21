import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';

/** O que o encerramento da árvore usa do sistema (injetável para testar o ramo de cada plataforma). */
export interface TreeDeps {
  platform: NodeJS.Platform;
  spawn: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
  killGroup: (pid: number) => void;
}

const systemDeps: TreeDeps = {
  platform: process.platform,
  spawn: (command, args, options) => spawn(command, args, { ...options, shell: false }),
  killGroup: (pid) => process.kill(-pid, 'SIGKILL'),
};

/**
 * Inicia um processo filho num grupo próprio (Linux/macOS) para que cancelar encerre também os netos
 * (pip compila/descompacta em subprocessos; o Demucs usa workers).
 */
export function spawnTree(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  deps: TreeDeps = systemDeps,
): ChildProcess {
  return deps.spawn(command, args, {
    shell: false,
    windowsHide: true,
    detached: deps.platform !== 'win32',
    env,
  });
}

/** Encerra o processo e todos os descendentes. */
export function killTree(child: ChildProcess, deps: TreeDeps = systemDeps): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  if (deps.platform === 'win32') {
    // taskkill /T encerra a árvore inteira; se ele nem iniciar, ao menos o processo direto é encerrado.
    let killer: ChildProcess;
    try {
      killer = deps.spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        shell: false,
      });
    } catch {
      child.kill();
      return;
    }
    killer.on('error', () => child.kill());
    // taskkill que roda mas falha (ex.: acesso negado) também cai no encerramento direto.
    killer.on('exit', (code) => {
      if (code !== 0) child.kill();
    });
    return;
  }
  try {
    deps.killGroup(child.pid);
  } catch {
    child.kill('SIGKILL');
  }
}
