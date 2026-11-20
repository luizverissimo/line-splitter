import type { ModelProgress } from '@line-splitter/shared';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { detectModel } from './detect';
import { DEFAULT_MODEL_SOURCE, ModelDownloader, type ModelSource } from './model';
import { enginePaths } from './paths';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-model-'));
  dirs.push(d);
  return d;
};

// Conteúdo de teste servido por um servidor HTTP local real.
const content = randomBytes(3 * 1024 * 1024 + 123);
const sha = createHash('sha256').update(content).digest('hex');
let server: http.Server;
let base: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (url === '/ok.th') {
      res.writeHead(200, { 'Content-Length': content.length });
      res.end(content);
    } else if (url === '/truncado.th') {
      res.writeHead(200, { 'Content-Length': content.length });
      res.write(content.subarray(0, 1024 * 1024), () => res.destroy());
    } else if (url === '/lento.th') {
      res.writeHead(200, { 'Content-Length': content.length });
      let sent = 0;
      const timer = setInterval(() => {
        if (sent >= content.length || res.destroyed) return clearInterval(timer);
        res.write(content.subarray(sent, sent + 64 * 1024));
        sent += 64 * 1024;
      }, 20);
      res.on('close', () => clearInterval(timer));
    } else {
      res.writeHead(404);
      res.end('não encontrado');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const source = (file: string, over: Partial<ModelSource> = {}): ModelSource => ({
  url: `${base}/${file}`,
  file: 'abcd1234-' + sha.slice(0, 8) + '.th',
  sizeBytes: content.length,
  sha256: sha,
  yamlFile: 'teste.yaml',
  yaml: "models: ['abcd1234']\n",
  ...over,
});

function run(src: ModelSource) {
  const paths = enginePaths(tmp());
  const progress: ModelProgress[] = [];
  const downloader = new ModelDownloader(paths, (p) => progress.push(p), src);
  return { paths, progress, downloader };
}

const leftovers = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

describe('ModelDownloader (HTTP real)', () => {
  it('baixa com progresso, confere SHA-256 e grava pesos + yaml', async () => {
    const { paths, progress, downloader } = run(source('ok.th'));
    const result = await downloader.download();
    expect(result).toEqual({ sizeBytes: content.length, sha256: sha });
    expect(fs.readFileSync(path.join(paths.modelsDir, source('ok.th').file)).equals(content)).toBe(true);
    expect(fs.readFileSync(path.join(paths.modelsDir, 'teste.yaml'), 'utf8')).toBe("models: ['abcd1234']\n");
    expect(progress[0]).toEqual({ receivedBytes: 0, totalBytes: content.length });
    expect(progress.at(-1)).toEqual({ receivedBytes: content.length, totalBytes: content.length });
    const received = progress.map((p) => p.receivedBytes);
    expect(received).toEqual([...received].sort((a, b) => a - b));
    expect(downloader.isRunning).toBe(false);
  });

  it('checksum diferente apaga o arquivo e explica', async () => {
    const { paths, downloader } = run(source('ok.th', { sha256: '0'.repeat(64) }));
    await expect(downloader.download()).rejects.toMatchObject({
      code: 'ENGINE_FAILED',
      message: expect.stringContaining('corrompido'),
      details: expect.stringContaining(sha),
    });
    expect(leftovers(paths.modelsDir)).toEqual([]);
  });

  it('conexão que cai no meio não deixa arquivo parcial', async () => {
    const { paths, downloader } = run(source('truncado.th'));
    await expect(downloader.download()).rejects.toMatchObject({ code: 'ENGINE_FAILED' });
    expect(leftovers(paths.modelsDir)).toEqual([]);
  });

  it('arquivo maior que o esperado é descartado', async () => {
    const { paths, downloader } = run(source('ok.th', { sizeBytes: 1024 }));
    await expect(downloader.download()).rejects.toMatchObject({
      message: expect.stringContaining('maior que o esperado'),
    });
    expect(leftovers(paths.modelsDir)).toEqual([]);
  });

  it('404 e servidor inalcançável viram mensagem de rede', async () => {
    await expect(run(source('nao-existe.th')).downloader.download()).rejects.toMatchObject({
      message: expect.stringContaining('sem conexão'),
      details: expect.stringContaining('HTTP 404'),
    });
    await expect(
      run(source('x', { url: 'http://127.0.0.1:9/x.th' })).downloader.download(),
    ).rejects.toMatchObject({
      message: expect.stringContaining('sem conexão'),
    });
  });

  it('cancelar interrompe, apaga o parcial e libera para tentar de novo', async () => {
    const { paths, progress, downloader } = run(source('lento.th'));
    const promise = downloader.download();
    await expect.poll(() => progress.length, { timeout: 5000 }).toBeGreaterThan(1);
    await expect(downloader.download()).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(downloader.cancel()).toBe(true);
    await expect(promise).rejects.toMatchObject({
      code: 'CANCELLED',
      message: 'Download do modelo cancelado.',
    });
    expect(leftovers(paths.modelsDir)).toEqual([]);
    expect(downloader.cancel()).toBe(false);
  });
});

describe('erros de disco', () => {
  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'pasta sem permissão de escrita: mensagem clara, sem parcial e liberado para tentar de novo',
    async () => {
      const { paths, downloader } = run(source('lento.th'));
      fs.mkdirSync(paths.modelsDir, { recursive: true });
      fs.chmodSync(paths.modelsDir, 0o500);
      try {
        await expect(downloader.download()).rejects.toMatchObject({
          code: 'IO',
          message: 'Sem permissão para gravar o modelo na pasta do motor.',
          details: expect.stringContaining('EACCES'),
        });
        expect(downloader.isRunning).toBe(false);
        await expect(downloader.download()).rejects.toMatchObject({ code: 'IO' });
      } finally {
        fs.chmodSync(paths.modelsDir, 0o700);
      }
      expect(leftovers(paths.modelsDir)).toEqual([]);
    },
  );

  it.runIf(process.platform === 'linux' && fs.existsSync('/dev/full'))(
    'disco cheio no meio da gravação (ENOSPC real via /dev/full) não trava',
    async () => {
      const src = source('ok.th');
      const { paths, downloader } = run(src);
      fs.mkdirSync(paths.modelsDir, { recursive: true });
      fs.symlinkSync('/dev/full', path.join(paths.modelsDir, `${src.file}.parcial`));
      await expect(downloader.download()).rejects.toMatchObject({
        code: 'IO',
        message: expect.stringContaining('Sem espaço em disco'),
        details: expect.stringContaining('ENOSPC'),
      });
      expect(downloader.isRunning).toBe(false);
      expect(leftovers(paths.modelsDir)).toEqual([]);
    },
  );

  it('caminho do motor inválido ao criar a pasta', async () => {
    const base = tmp();
    fs.writeFileSync(path.join(base, 'arquivo'), 'x');
    const downloader = new ModelDownloader(
      enginePaths(path.join(base, 'arquivo')),
      () => undefined,
      source('ok.th'),
    );
    await expect(downloader.download()).rejects.toMatchObject({ code: 'IO' });
    expect(downloader.isRunning).toBe(false);
  });
});

describe('modelo htdemucs_6s real', () => {
  it(
    'baixa do servidor oficial, confere o checksum e a detecção fica ✔',
    async () => {
      const paths = enginePaths(tmp());
      const downloader = new ModelDownloader(paths, () => undefined);
      const result = await downloader.download();
      expect(result.sizeBytes).toBe(DEFAULT_MODEL_SOURCE.sizeBytes);
      expect(result.sha256).toBe(DEFAULT_MODEL_SOURCE.sha256);
      expect(detectModel(paths)).toEqual({ ok: true, detail: 'Modelo htdemucs_6s (52 MB)' });
    },
    5 * 60_000,
  );
});
