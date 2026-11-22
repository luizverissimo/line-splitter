import { AppError, type ModelDownloadResult, type ModelProgress } from '@line-splitter/shared';
import { createHash, type Hash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { SEPARATION_MODELS, type EnginePaths, type ModelFile, type SeparationModel } from './paths';

/** Erros de disco ao gravar um modelo, com mensagem para o usuário. */
const DISK_ERRORS: Record<string, string> = {
  EACCES: 'Sem permissão para gravar os modelos na pasta do motor.',
  EPERM: 'Sem permissão para gravar os modelos na pasta do motor.',
  EROFS: 'A pasta do motor está num disco somente leitura.',
  ENOSPC: 'Sem espaço em disco para gravar os modelos (são necessários cerca de 1,7 GB).',
  EIO: 'Erro de leitura/gravação no disco ao salvar os modelos.',
  EISDIR: 'Já existe uma pasta com o nome de um arquivo de modelo.',
  ENOTDIR: 'O caminho da pasta do motor é inválido.',
};

const NETWORK_MESSAGE =
  'Não foi possível baixar os modelos: sem conexão com a internet ou servidor indisponível.';

/** O arquivo já está na pasta de modelos com o tamanho esperado. */
export function modelFilePresent(modelsDir: string, file: ModelFile): boolean {
  try {
    return fs.statSync(path.join(modelsDir, file.file)).size === file.sizeBytes;
  } catch {
    return false;
  }
}

/** Arquivos gerados localmente (ex.: yaml do Demucs) presentes e com o conteúdo esperado. */
export function generatedFilesPresent(modelsDir: string, model: SeparationModel): boolean {
  return (model.generated ?? []).every((g) => {
    try {
      return fs.readFileSync(path.join(modelsDir, g.file), 'utf8') === g.content;
    } catch {
      return false;
    }
  });
}

/** Lê o pedaço já baixado (de uma tentativa anterior) para continuar o hash de onde parou. */
function resumeState(partialPath: string, expected: number): { have: number; hash: Hash } {
  const hash = createHash('sha256');
  let have = 0;
  try {
    have = fs.statSync(partialPath).size;
  } catch {
    return { have: 0, hash };
  }
  if (have > expected) {
    fs.rmSync(partialPath, { force: true });
    return { have: 0, hash: createHash('sha256') };
  }
  if (have === 0) return { have, hash };
  // Lê exatamente os bytes que o arquivo diz ter (um arquivo especial no lugar do parcial nunca "acaba").
  const fd = fs.openSync(partialPath, 'r');
  try {
    const buf = Buffer.alloc(4 * 1024 * 1024);
    let read = 0;
    while (read < have) {
      const n = fs.readSync(fd, buf, 0, Math.min(buf.length, have - read), read);
      if (n <= 0) break;
      hash.update(buf.subarray(0, n));
      read += n;
    }
    if (read !== have) return { have: 0, hash: createHash('sha256') };
  } finally {
    fs.closeSync(fd);
  }
  return { have, hash };
}

/**
 * Baixa os modelos de separação que faltam para a pasta do motor, com progresso somado, conferindo tamanho
 * e SHA-256 de cada arquivo. Cada arquivo vai para um `.parcial` e só é renomeado no fim; um download
 * interrompido (rede, cancelamento, app fechado) continua de onde parou na próxima vez (HTTP Range).
 */
export class ModelDownloader {
  private controller: AbortController | null = null;

  constructor(
    private readonly paths: EnginePaths,
    private readonly onProgress: (progress: ModelProgress) => void,
    private readonly models: readonly SeparationModel[] = SEPARATION_MODELS,
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
    if (this.controller) throw new AppError('CONFLICT', 'O download dos modelos já está em andamento.');
    const controller = new AbortController();
    this.controller = controller;
    const { modelsDir } = this.paths;
    try {
      try {
        fs.mkdirSync(modelsDir, { recursive: true });
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        throw new AppError(
          'IO',
          DISK_ERRORS[code] ?? 'Não foi possível criar a pasta dos modelos.',
          `${code}: ${modelsDir}`,
        );
      }
      const pending = this.models.flatMap((model) =>
        model.files.filter((f) => !modelFilePresent(modelsDir, f)).map((file) => ({ model, file })),
      );
      const totalBytes = pending.reduce((sum, p) => sum + p.file.sizeBytes, 0);
      let doneBytes = 0;
      let transferred = 0;
      const done: string[] = [];
      for (const { model, file } of pending) {
        transferred += await this.downloadFile(model, file, controller, (received) =>
          this.onProgress({ receivedBytes: doneBytes + received, totalBytes, model: model.name }),
        );
        doneBytes += file.sizeBytes;
        if (!done.includes(model.name)) done.push(model.name);
      }
      for (const model of this.models) {
        for (const g of model.generated ?? []) fs.writeFileSync(path.join(modelsDir, g.file), g.content);
      }
      return { sizeBytes: transferred, models: done };
    } catch (err) {
      if (controller.signal.aborted) {
        throw new AppError(
          'CANCELLED',
          'Download dos modelos cancelado. O que já foi baixado é aproveitado na próxima vez.',
        );
      }
      throw err;
    } finally {
      this.controller = null;
    }
  }

  private async downloadFile(
    model: SeparationModel,
    file: ModelFile,
    controller: AbortController,
    progress: (received: number) => void,
  ): Promise<number> {
    const finalPath = path.join(this.paths.modelsDir, file.file);
    const partialPath = `${finalPath}.parcial`;
    let { have, hash } = resumeState(partialPath, file.sizeBytes);
    if (have === file.sizeBytes) {
      // Baixado por inteiro numa vez anterior, mas não renomeado (o app fechou bem nessa hora).
      progress(have);
      if (hash.digest('hex') === file.sha256) {
        fs.renameSync(partialPath, finalPath);
        return 0;
      }
      fs.rmSync(partialPath, { force: true });
      have = 0;
      hash = createHash('sha256');
    }
    let response: Response;
    try {
      response = await fetch(file.url, {
        signal: controller.signal,
        headers: have > 0 ? { Range: `bytes=${have}-` } : {},
      });
    } catch (err) {
      if (controller.signal.aborted) throw err;
      throw new AppError('ENGINE_FAILED', NETWORK_MESSAGE, err instanceof Error ? err.message : String(err));
    }
    const range = /^bytes (\d+)-\d+\/\d+$/.exec(response.headers.get('content-range') ?? '');
    if (have > 0 && (response.status === 200 || (response.status === 206 && Number(range?.[1]) !== have))) {
      // O servidor (ou um proxy) ignorou o Range ou devolveu outro trecho: recomeça o arquivo do zero.
      if (response.status === 206) {
        await response.body?.cancel();
        response = await this.refetch(file, controller);
      }
      have = 0;
      hash = createHash('sha256');
    } else if (!response.ok || !response.body) {
      throw new AppError('ENGINE_FAILED', NETWORK_MESSAGE, `HTTP ${response.status} em ${file.url}`);
    }
    if (!response.body) throw new AppError('ENGINE_FAILED', NETWORK_MESSAGE, `Resposta vazia de ${file.url}`);
    const resumedFrom = have;
    let received = have;
    let lastEmit = 0;
    progress(received);
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > file.sizeBytes) {
          callback(
            new AppError(
              'ENGINE_FAILED',
              `O arquivo ${file.file} veio maior que o esperado; download descartado.`,
            ),
          );
          return;
        }
        hash.update(chunk);
        const now = Date.now();
        if (now - lastEmit > 150) {
          lastEmit = now;
          progress(received);
        }
        callback(null, chunk);
      },
    });
    try {
      // pipeline propaga erros de qualquer ponta (rede, disco) e fecha tudo; o signal cancela.
      await pipeline(
        Readable.fromWeb(response.body as unknown as WebReadableStream<Uint8Array>),
        meter,
        fs.createWriteStream(partialPath, { flags: have > 0 ? 'a' : 'w' }),
        { signal: controller.signal },
      );
    } catch (err) {
      if (controller.signal.aborted) throw err;
      if (err instanceof AppError) {
        fs.rmSync(partialPath, { force: true });
        throw err;
      }
      const code = (err as NodeJS.ErrnoException).code;
      if (code && DISK_ERRORS[code]) throw new AppError('IO', DISK_ERRORS[code], `${code}: ${partialPath}`);
      throw new AppError(
        'ENGINE_FAILED',
        'A conexão caiu durante o download dos modelos. Tente de novo: o download continua de onde parou.',
        err instanceof Error ? err.message : String(err),
      );
    }
    progress(received);
    if (received !== file.sizeBytes) {
      throw new AppError(
        'ENGINE_FAILED',
        'O download dos modelos ficou incompleto. Tente de novo: o download continua de onde parou.',
        `${file.file}: recebidos ${received} de ${file.sizeBytes} bytes.`,
      );
    }
    const sha256 = hash.digest('hex');
    if (sha256 !== file.sha256) {
      fs.rmSync(partialPath, { force: true });
      throw new AppError(
        'ENGINE_FAILED',
        `Um arquivo do modelo ${model.name} veio corrompido (checksum diferente do esperado). Tente de novo.`,
        `${file.file}: SHA-256 ${sha256}; esperado ${file.sha256}.`,
      );
    }
    fs.renameSync(partialPath, finalPath);
    return received - resumedFrom;
  }

  /** Pede o arquivo inteiro de novo, sem Range. */
  private async refetch(file: ModelFile, controller: AbortController): Promise<Response> {
    try {
      const response = await fetch(file.url, { signal: controller.signal });
      if (!response.ok)
        throw new AppError('ENGINE_FAILED', NETWORK_MESSAGE, `HTTP ${response.status} em ${file.url}`);
      return response;
    } catch (err) {
      if (controller.signal.aborted || err instanceof AppError) throw err;
      throw new AppError('ENGINE_FAILED', NETWORK_MESSAGE, err instanceof Error ? err.message : String(err));
    }
  }
}
