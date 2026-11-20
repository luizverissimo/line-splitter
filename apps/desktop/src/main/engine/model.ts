import { AppError, type ModelDownloadResult, type ModelProgress } from '@line-splitter/shared';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { HTDEMUCS_6S, type EnginePaths } from './paths';

export interface ModelSource {
  url: string;
  file: string;
  sizeBytes: number;
  /** SHA-256 completo esperado (o Demucs só confere os 8 primeiros hex, que vão no nome do arquivo). */
  sha256: string;
  yamlFile: string;
  yaml: string;
}

export const DEFAULT_MODEL_SOURCE: ModelSource = {
  url: HTDEMUCS_6S.url,
  file: HTDEMUCS_6S.file,
  sizeBytes: HTDEMUCS_6S.sizeBytes,
  sha256: HTDEMUCS_6S.sha256,
  yamlFile: HTDEMUCS_6S.yamlFile,
  yaml: HTDEMUCS_6S.yaml,
};

/** Erros de disco ao gravar o modelo, com mensagem para o usuário. */
const DISK_ERRORS: Record<string, string> = {
  EACCES: 'Sem permissão para gravar o modelo na pasta do motor.',
  EPERM: 'Sem permissão para gravar o modelo na pasta do motor.',
  EROFS: 'A pasta do motor está num disco somente leitura.',
  ENOSPC: 'Sem espaço em disco para gravar o modelo (são necessários cerca de 55 MB).',
  EIO: 'Erro de leitura/gravação no disco ao salvar o modelo.',
  EISDIR: 'Já existe uma pasta com o nome do arquivo do modelo.',
  ENOTDIR: 'O caminho da pasta do motor é inválido.',
};

const NETWORK_MESSAGE =
  'Não foi possível baixar o modelo: sem conexão com a internet ou servidor indisponível.';

/**
 * Baixa os pesos do modelo para o repositório local do motor, com progresso, conferindo tamanho e SHA-256.
 * Grava num arquivo `.parcial` e só renomeia no fim: um download interrompido nunca parece completo.
 */
export class ModelDownloader {
  private controller: AbortController | null = null;

  constructor(
    private readonly paths: EnginePaths,
    private readonly onProgress: (progress: ModelProgress) => void,
    private readonly source: ModelSource = DEFAULT_MODEL_SOURCE,
  ) {}

  get isRunning(): boolean {
    return this.controller !== null;
  }

  cancel(): boolean {
    if (!this.controller) return false;
    this.controller.abort();
    return true;
  }

  async download(): Promise<ModelDownloadResult> {
    if (this.controller) throw new AppError('CONFLICT', 'O download do modelo já está em andamento.');
    const controller = new AbortController();
    this.controller = controller;
    const { modelsDir } = this.paths;
    const finalPath = path.join(modelsDir, this.source.file);
    const partialPath = `${finalPath}.parcial`;
    try {
      try {
        fs.mkdirSync(modelsDir, { recursive: true });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        throw new AppError(
          'IO',
          DISK_ERRORS[code] ?? 'Não foi possível criar a pasta do modelo.',
          `${code}: ${modelsDir}`,
        );
      }
      let response: Response;
      try {
        response = await fetch(this.source.url, { signal: controller.signal });
      } catch (err) {
        if (controller.signal.aborted) throw err;
        throw new AppError(
          'ENGINE_FAILED',
          NETWORK_MESSAGE,
          err instanceof Error ? err.message : String(err),
        );
      }
      if (!response.ok || !response.body) {
        throw new AppError('ENGINE_FAILED', NETWORK_MESSAGE, `HTTP ${response.status} em ${this.source.url}`);
      }
      const total = this.source.sizeBytes;
      const hash = createHash('sha256');
      let received = 0;
      let lastEmit = 0;
      this.onProgress({ receivedBytes: 0, totalBytes: total });
      const onProgress = this.onProgress;
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          received += chunk.length;
          if (received > total) {
            callback(
              new AppError(
                'ENGINE_FAILED',
                'O arquivo do modelo veio maior que o esperado; download descartado.',
              ),
            );
            return;
          }
          hash.update(chunk);
          const now = Date.now();
          if (now - lastEmit > 150) {
            lastEmit = now;
            onProgress({ receivedBytes: received, totalBytes: total });
          }
          callback(null, chunk);
        },
      });
      try {
        // pipeline propaga erros de qualquer ponta (rede, disco) e fecha tudo; o signal cancela.
        await pipeline(
          Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
          meter,
          fs.createWriteStream(partialPath),
          { signal: controller.signal },
        );
      } catch (err) {
        if (controller.signal.aborted || err instanceof AppError) throw err;
        const code = (err as NodeJS.ErrnoException).code;
        if (code && DISK_ERRORS[code]) {
          throw new AppError('IO', DISK_ERRORS[code], `${code}: ${partialPath}`);
        }
        throw new AppError(
          'ENGINE_FAILED',
          'A conexão caiu durante o download do modelo. Tente de novo.',
          err instanceof Error ? err.message : String(err),
        );
      }
      this.onProgress({ receivedBytes: received, totalBytes: total });
      const sha256 = hash.digest('hex');
      if (received !== total) {
        throw new AppError(
          'ENGINE_FAILED',
          'O download do modelo ficou incompleto. Tente de novo.',
          `Recebidos ${received} de ${total} bytes.`,
        );
      }
      if (sha256 !== this.source.sha256) {
        throw new AppError(
          'ENGINE_FAILED',
          'O arquivo do modelo está corrompido (checksum diferente do esperado). Tente de novo.',
          `SHA-256 ${sha256}; esperado ${this.source.sha256}.`,
        );
      }
      fs.renameSync(partialPath, finalPath);
      fs.writeFileSync(path.join(modelsDir, this.source.yamlFile), this.source.yaml);
      return { sizeBytes: received, sha256 };
    } catch (err) {
      // existsSync não lança com caminho inválido (ex.: pasta do motor é um arquivo).
      if (fs.existsSync(partialPath)) fs.rmSync(partialPath, { force: true });
      if (controller.signal.aborted) {
        throw new AppError('CANCELLED', 'Download do modelo cancelado.');
      }
      throw err;
    } finally {
      this.controller = null;
    }
  }
}
