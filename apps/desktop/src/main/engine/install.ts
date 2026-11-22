import { AppError, type InstallLog, type InstallResult, type InstallStep } from '@line-splitter/shared';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { detectSeparator } from './detect';
import { findInPath, run } from './exec';
import type { EnginePaths } from './paths';
import { killTree, spawnTree } from './process-tree';

/** Versões fixadas do motor (DEC-011, DEC-017). */
export const ENGINE_PACKAGES = {
  torch: 'torch==2.6.0',
  torchaudio: 'torchaudio==2.6.0',
  /** Separador dos modelos RoFormer (DEC-017); o extra "cpu" traz o onnxruntime que ele importa. */
  separator: 'audio-separator[cpu]==0.48.0',
  /** O audio-separator importa o audioread (via librosa) sem declarar a dependência. */
  audioread: 'audioread>=3,<4',
  /**
   * Restrições do pip: sem elas, as dependências do audio-separator trocariam o PyTorch 2.6 (com CUDA 12.4)
   * pela versão mais nova do PyPI.
   */
  constraints: ['torch==2.6.0', 'torchaudio==2.6.0'],
  torchIndex: {
    cuda: 'https://download.pytorch.org/whl/cu124',
    cpu: 'https://download.pytorch.org/whl/cpu',
  },
} as const;

export interface InstallEvents {
  step: (step: InstallStep) => void;
  log: (log: InstallLog) => void;
}

export interface InstallTarget {
  /** Python do sistema que cria o ambiente. */
  systemPython: string;
  /** Instalar o PyTorch com CUDA. */
  cuda: boolean;
}

export interface InstallOptions {
  reinstall: boolean;
  /**
   * Python e variante do PyTorch, já conhecidos ou descobertos depois que a instalação começa
   * (assim o Cancelar vale desde o primeiro instante).
   */
  target: InstallTarget | (() => Promise<InstallTarget>);
  /** Variáveis extras para o pip (ex.: proxy corporativo). */
  extraEnv?: NodeJS.ProcessEnv;
}

/** Há GPU NVIDIA com driver funcionando? (decide entre o PyTorch CUDA e o de CPU) */
export async function hasNvidiaGpu(): Promise<boolean> {
  const smi = findInPath(['nvidia-smi']);
  if (!smi) return false;
  const r = await run(smi, ['-L'], { timeoutMs: 15_000 });
  return r.code === 0 && /GPU \d+:/.test(r.stdout);
}

const MAX_LOG_LINES = 400;

/** Traduz a saída do pip/venv numa mensagem que o usuário entende. */
export function explainInstallFailure(log: string): string {
  if (
    /Temporary failure in name resolution|Failed to establish a new connection|Network is unreachable|Could not resolve host|ConnectionError|Max retries exceeded|ProxyError|Cannot connect to proxy|\(from versions: none\)/i.test(
      log,
    )
  ) {
    return 'Sem conexão com a internet (ou o servidor de pacotes não respondeu). Verifique a rede e tente de novo.';
  }
  if (/ensurepip is not available|No module named venv/i.test(log)) {
    return 'O Python do sistema não consegue criar ambientes. No Ubuntu/Debian, instale com: sudo apt install python3-venv';
  }
  if (/No space left on device/i.test(log)) {
    return 'Sem espaço em disco para instalar o motor (são necessários alguns GB).';
  }
  if (/No matching distribution found|Could not find a version that satisfies/i.test(log)) {
    return 'Não há pacote do PyTorch/separador compatível com esta versão do Python. Use o Python 3.10 a 3.13.';
  }
  return 'A instalação do motor falhou. Veja o log técnico para os detalhes.';
}

export class EngineInstaller {
  private child: ChildProcess | null = null;
  private cancelled = false;
  private running = false;
  private readonly lines: string[] = [];
  /** Motivo pelo qual o log em disco ficou incompleto (null = íntegro). */
  private logBroken: string | null = null;

  constructor(
    private readonly paths: EnginePaths,
    private readonly events: InstallEvents,
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** Cancela a instalação em andamento; o ambiente parcial é apagado. */
  cancel(): boolean {
    if (!this.running) return false;
    this.cancelled = true;
    if (this.child) killTree(this.child);
    return true;
  }

  async install(options: InstallOptions): Promise<InstallResult> {
    if (this.running) throw new AppError('CONFLICT', 'Já existe uma instalação do motor em andamento.');
    this.running = true;
    this.cancelled = false;
    this.lines.length = 0;
    this.logBroken = null;
    const { venvPython, venvDir } = this.paths;
    const total = 5;
    let target: InstallTarget = { systemPython: '', cuda: false };
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      PIP_NO_INPUT: '1',
      PYTHONNOUSERSITE: '1',
      PYTHONUNBUFFERED: '1',
      TORCH_HOME: this.paths.torchHome,
      ...options.extraEnv,
    };
    try {
      try {
        fs.mkdirSync(this.paths.engineDir, { recursive: true });
        fs.writeFileSync(this.logFile, `Instalação do motor iniciada em ${new Date().toISOString()}\n`);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        throw new AppError('ENGINE_FAILED', explainInstallFailure(detail), detail);
      }
      target = typeof options.target === 'function' ? await options.target() : options.target;
      if (this.cancelled) throw new Error('cancelado antes de começar');
      this.step(1, total, 'Criando o ambiente Python do motor');
      if (options.reinstall) fs.rmSync(venvDir, { recursive: true, force: true });
      if (!fs.existsSync(venvPython)) {
        fs.rmSync(venvDir, { recursive: true, force: true });
        fs.mkdirSync(this.paths.engineDir, { recursive: true });
        await this.exec(target.systemPython, ['-m', 'venv', venvDir], env);
      } else {
        this.log('Ambiente existente encontrado; os pacotes serão conferidos.', 'info');
      }

      this.step(2, total, 'Atualizando o pip');
      await this.exec(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip'], env);

      const flavor = target.cuda ? 'cuda' : 'cpu';
      this.step(
        3,
        total,
        target.cuda ? 'Instalando o PyTorch com suporte à GPU (CUDA)' : 'Instalando o PyTorch (CPU)',
      );
      await this.exec(
        venvPython,
        [
          '-m',
          'pip',
          'install',
          '--progress-bar',
          'off',
          ENGINE_PACKAGES.torch,
          ENGINE_PACKAGES.torchaudio,
          '--index-url',
          ENGINE_PACKAGES.torchIndex[flavor],
        ],
        env,
      );

      this.step(4, total, 'Instalando o separador (audio-separator)');
      const constraints = path.join(this.paths.engineDir, 'restricoes.txt');
      fs.writeFileSync(constraints, `${ENGINE_PACKAGES.constraints.join('\n')}\n`);
      await this.exec(
        venvPython,
        [
          '-m',
          'pip',
          'install',
          '--progress-bar',
          'off',
          '--constraint',
          constraints,
          ENGINE_PACKAGES.separator,
          ENGINE_PACKAGES.audioread,
        ],
        env,
      );

      this.step(5, total, 'Conferindo a instalação');
      const check = await detectSeparator(this.paths);
      if (this.cancelled) throw new Error('cancelado durante a conferência');
      if (!check.ok || !check.torch) {
        throw new AppError(
          'ENGINE_FAILED',
          'O motor foi instalado, mas o separador não carregou.',
          check.detail,
        );
      }
      this.log(check.detail, 'info');
      return { separator: check.torch.separator, torch: check.torch.torch, cuda: check.torch.cuda };
    } catch (err) {
      if (this.cancelled) {
        try {
          // No Windows o taskkill é assíncrono: arquivos podem ficar presos por alguns instantes.
          fs.rmSync(venvDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
        } catch (rmErr) {
          throw new AppError(
            'CANCELLED',
            `Instalação cancelada, mas não foi possível apagar ${venvDir}. Feche o app e apague a pasta manualmente.`,
            rmErr instanceof Error ? rmErr.message : String(rmErr),
          );
        }
        throw new AppError('CANCELLED', 'Instalação cancelada. O ambiente parcial foi removido.');
      }
      if (err instanceof AppError) throw err;
      const tail = this.lines.join('\n');
      throw new AppError(
        'ENGINE_FAILED',
        explainInstallFailure(tail),
        this.logBroken ? `${tail}\n\n(${this.logBroken})` : `${tail}\n\n(Log completo em ${this.logFile})`,
      );
    } finally {
      this.child = null;
      this.running = false;
    }
  }

  private step(step: number, total: number, label: string) {
    this.log(`== ${label}`, 'info');
    this.events.step({ step, total, label });
  }

  private get logFile(): string {
    return path.join(this.paths.engineDir, 'install.log');
  }

  private log(line: string, stream: InstallLog['stream']) {
    // Log completo em disco; em memória só o fim, para os detalhes do erro.
    if (!this.logBroken) {
      try {
        fs.appendFileSync(this.logFile, `${line}\n`);
      } catch (err) {
        this.logBroken = `Não foi possível gravar o log completo em ${this.logFile}: ${err instanceof Error ? err.message : String(err)}`;
        this.lines.push(this.logBroken);
        this.events.log({ line: this.logBroken, stream: 'info' });
      }
    }
    this.lines.push(line);
    if (this.lines.length > MAX_LOG_LINES) this.lines.shift();
    this.events.log({ line, stream });
  }

  private exec(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
    if (this.cancelled) return Promise.reject(new Error('cancelado'));
    return new Promise((resolve, reject) => {
      const child = spawnTree(command, args, env);
      this.child = child;
      const pipe = (stream: 'stdout' | 'stderr') => {
        let buffer = '';
        child[stream]?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const parts = buffer.split(/\r?\n|\r/);
          buffer = parts.pop() ?? '';
          for (const part of parts) if (part.trim()) this.log(part, stream);
        });
        child[stream]?.on('end', () => {
          if (buffer.trim()) this.log(buffer, stream);
        });
      };
      pipe('stdout');
      pipe('stderr');
      child.on('error', (err) => {
        this.log(err.message, 'stderr');
        reject(err);
      });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`${command} terminou com código ${code ?? 'desconhecido'}`));
      });
    });
  }
}
