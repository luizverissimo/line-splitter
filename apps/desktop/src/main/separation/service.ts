import {
  AppError,
  instrumentOf,
  type SeparationProgress,
  type SeparationResult,
  type Settings,
  type Stem,
} from '@line-splitter/shared';
import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectAudio } from '../audio/inspect';
import { detectEngine } from '../engine/detect';
import { modelForStem, type EnginePaths } from '../engine/paths';
import { killTree, spawnTree } from '../engine/process-tree';
import type { HistoryRepository } from '../history/repository';
import type { MediaRegistry } from '../media/registry';
import { outputPaths } from './naming';
import { RUNNER_OK, RUNNER_SCRIPT, parseSeparatorProgress } from './runner';
import { explainEngineFailure, isCorruptedModel } from './errors';

export interface SeparationDeps {
  paths: EnginePaths;
  settings: () => Settings;
  history: HistoryRepository;
  media: MediaRegistry;
  /** Arquivo de entrada atual (escolhido e validado pelo canal audio:inspect). */
  currentInput: () => string | null;
  onProgress: (progress: SeparationProgress) => void;
  /** Pasta para arquivos temporários (padrão: a do sistema). */
  tmpRoot?: string;
}

const MAX_LOG_CHARS = 64 * 1024;

/**
 * Separação real (DEC-017): o melhor modelo para o instrumento, rodado pelo audio-separator com os pesos da
 * pasta do motor, numa pasta temporária; FFmpeg para MP3; só no fim os dois arquivos vão para a pasta de
 * saída (DEC-002).
 */
export class SeparationService {
  private child: ChildProcess | null = null;
  private running = false;
  private cancelled = false;
  private log = '';

  constructor(private readonly deps: SeparationDeps) {}

  get isRunning(): boolean {
    return this.running;
  }

  cancel(): boolean {
    if (!this.running) return false;
    this.cancelled = true;
    if (this.child) killTree(this.child);
    return true;
  }

  async run(stem: Stem): Promise<SeparationResult> {
    if (this.running) throw new AppError('CONFLICT', 'Já existe uma separação em andamento.');
    this.running = true;
    this.cancelled = false;
    this.log = '';
    const started = Date.now();
    let tmp: string | null = null;
    try {
      const input = this.deps.currentInput();
      if (!input) throw new AppError('VALIDATION', 'Escolha um arquivo de áudio antes de separar.');
      this.progress('preparing', 0);
      const settings = this.deps.settings();
      const engine = await detectEngine(settings, this.deps.paths);
      if (engine.separator.ok && engine.ffmpeg.ok && !engine.model.ok) {
        // Nunca baixamos nada durante a separação: sem o modelo local, explica e para.
        throw new AppError(
          'ENGINE_MISSING',
          'Os modelos de separação não foram baixados. Baixe-os na tela Motor (é preciso internet só nessa etapa).',
          engine.model.detail,
        );
      }
      if (!engine.ready || !engine.ffmpeg.path || !engine.ffmpeg.ffprobePath) {
        const problems = [engine.python, engine.ffmpeg, engine.separator, engine.model]
          .filter((item) => !item.ok)
          .map((item) => item.detail)
          .join('\n');
        throw new AppError(
          'ENGINE_MISSING',
          'O motor de separação não está pronto. Confira a tela Motor.',
          problems,
        );
      }
      const audio = await inspectAudio(input, engine.ffmpeg.ffprobePath);
      const device = engine.device.effective;
      tmp = fs.mkdtempSync(path.join(this.deps.tmpRoot ?? os.tmpdir(), 'line-splitter-sep-'));

      // O FFmpeg converte a entrada (qualquer formato aceito) num WAV de ponto flutuante a 44,1 kHz estéreo:
      // é o que o separador espera e o que torna exato o cálculo do "resto" (mix − instrumento).
      const mixWav = path.join(tmp, 'mix.wav');
      this.progress('preparing', 2);
      await this.exec(engine.ffmpeg.path, [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        input,
        '-vn',
        '-ac',
        '2',
        '-ar',
        '44100',
        '-c:a',
        'pcm_f32le',
        mixWav,
      ]);
      const model = modelForStem(stem);
      let separatorStarted = false;
      await this.exec(
        this.deps.paths.venvPython,
        ['-c', RUNNER_SCRIPT, model.checkpoint, model.config, this.deps.paths.modelsDir, tmp, mixWav, stem],
        (chunk) => {
          // A fase "separando" começa com a primeira saída do processo do separador.
          if (!separatorStarted) {
            separatorStarted = true;
            this.progress('separating', 3);
          }
          const p = parseSeparatorProgress(chunk);
          if (p !== null) this.progress('separating', 3 + p * 0.82);
        },
        {
          // CPU forçada (Configurações): o PyTorch não enxerga a GPU.
          ...(device === 'cpu' ? { CUDA_VISIBLE_DEVICES: '' } : {}),
          // O audio-separator procura o FFmpeg no PATH: usamos o mesmo FFmpeg detectado pelo app.
          PATH: [path.dirname(engine.ffmpeg.path), process.env.PATH ?? ''].join(path.delimiter),
        },
      );
      if (!this.log.includes(RUNNER_OK)) {
        throw new AppError('ENGINE_FAILED', 'O separador terminou sem confirmar as duas faixas.', this.log);
      }
      const stemWav = path.join(tmp, 'instrumento.wav');
      const restWav = path.join(tmp, 'resto.wav');
      for (const f of [stemWav, restWav]) {
        if (!fs.existsSync(f)) {
          throw new AppError('ENGINE_FAILED', 'O separador terminou sem gerar as duas faixas.', this.log);
        }
      }

      this.progress('encoding', 85);
      const stemMp3 = path.join(tmp, 'instrumento.mp3');
      const restMp3 = path.join(tmp, 'resto.mp3');
      await this.encode(engine.ffmpeg.path, stemWav, stemMp3, settings.bitrateKbps);
      this.progress('encoding', 92);
      await this.encode(engine.ffmpeg.path, restWav, restMp3, settings.bitrateKbps);

      this.progress('saving', 97);
      if (this.cancelled) throw new Error('cancelado');
      const outputDir = settings.outputDir;
      try {
        fs.mkdirSync(outputDir, { recursive: true });
      } catch (err) {
        throw new AppError(
          'IO',
          'Não foi possível criar a pasta de saída.',
          err instanceof Error ? err.message : String(err),
        );
      }
      const label = instrumentOf(stem).fileLabel;
      const target = outputPaths(outputDir, audio.name, label);
      const placed: string[] = [];
      try {
        for (const [from, to] of [
          [stemMp3, target.instrument],
          [restMp3, target.rest],
        ] as const) {
          // COPYFILE_EXCL: nunca sobrescreve um arquivo que apareceu depois de escolhermos o nome.
          fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
          placed.push(to);
        }
      } catch (err) {
        for (const f of placed) fs.rmSync(f, { force: true });
        throw new AppError(
          'IO',
          'Não foi possível gravar os MP3 na pasta de saída.',
          err instanceof Error ? err.message : String(err),
        );
      }

      const processingMs = Date.now() - started;
      const row = this.deps.history.insert({
        sourcePath: input,
        sourceName: audio.name,
        stem,
        audioDurationS: audio.durationS,
        processingMs,
        device,
        bitrateKbps: settings.bitrateKbps,
        instrumentOutput: target.instrument,
        restOutput: target.rest,
        model: model.name,
      });
      this.progress('saving', 100);
      return {
        id: row.id,
        stem,
        sourcePath: input,
        instrumentPath: target.instrument,
        restPath: target.rest,
        instrumentUrl: this.deps.media.register(target.instrument),
        restUrl: this.deps.media.register(target.rest),
        processingMs,
        device,
        model: model.name,
      };
    } catch (err) {
      if (this.cancelled) throw new AppError('CANCELLED', 'Separação cancelada. Nenhum arquivo foi gerado.');
      if (err instanceof AppError) throw err;
      const technical = `${this.log}\n${err instanceof Error ? err.message : String(err)}`.trim();
      if (isCorruptedModel(technical)) {
        // Pesos corrompidos: tira o arquivo para a tela Motor oferecer o download de novo.
        fs.rmSync(path.join(this.deps.paths.modelsDir, modelForStem(stem).checkpoint), { force: true });
      }
      throw new AppError('ENGINE_FAILED', explainEngineFailure(technical), technical);
    } finally {
      if (tmp) fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      this.child = null;
      this.running = false;
    }
  }

  private progress(phase: SeparationProgress['phase'], percent: number) {
    // Depois do Cancelar a barra não anda mais, mesmo que chegue saída atrasada do processo.
    if (this.cancelled) return;
    this.deps.onProgress({ phase, percent: Math.min(100, Math.max(0, percent)) });
  }

  private encode(ffmpeg: string, input: string, output: string, bitrate: number): Promise<void> {
    return this.exec(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      input,
      '-codec:a',
      'libmp3lame',
      '-b:a',
      `${bitrate}k`,
      '-ar',
      '44100',
      '-ac',
      '2',
      output,
    ]);
  }

  private exec(
    command: string,
    args: string[],
    onChunk?: (chunk: string) => void,
    extraEnv: NodeJS.ProcessEnv = {},
  ): Promise<void> {
    if (this.cancelled) return Promise.reject(new Error('cancelado'));
    return new Promise((resolve, reject) => {
      const child = spawnTree(command, args, {
        ...process.env,
        PYTHONNOUSERSITE: '1',
        PYTHONUNBUFFERED: '1',
        TORCH_HOME: this.deps.paths.torchHome,
        // Garantias extras de que nada é baixado: o modelo é carregado da pasta do motor e o hub fica offline.
        HF_HUB_OFFLINE: '1',
        HF_DATASETS_OFFLINE: '1',
        TRANSFORMERS_OFFLINE: '1',
        ...extraEnv,
      });
      this.child = child;
      const collect = (d: Buffer) => {
        const text = d.toString();
        this.log = (this.log + text).slice(-MAX_LOG_CHARS);
        onChunk?.(text);
      };
      child.stdout?.on('data', collect);
      child.stderr?.on('data', collect);
      child.on('error', (err) => reject(err));
      child.on('close', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`${path.basename(command)} terminou com ${signal ?? `código ${code ?? '?'}`}`));
      });
    });
  }
}
