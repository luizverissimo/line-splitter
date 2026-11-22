import type { ModelProgress } from '@line-splitter/shared';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { detectModels, summarizeModels } from './detect';
import { ModelDownloader } from './model';
import {
  enginePaths,
  INSTRUMENTS_MODEL,
  SEPARATION_MODELS,
  VOCALS_MODEL,
  type ModelFile,
  type SeparationModel,
} from './paths';

const dirs: string[] = [];
const tmp = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-model-'));
  dirs.push(d);
  return d;
};

// Conteúdos servidos por um servidor HTTP local real (com suporte a Range, como o GitHub).
const big = randomBytes(3 * 1024 * 1024 + 123);
const small = randomBytes(40 * 1024 + 7);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
let server: http.Server;
let base: string;
const requests: { url: string; range: string | undefined }[] = [];
const failedOnce = new Set<string>();

function serve(res: http.ServerResponse, req: http.IncomingMessage, body: Buffer, ranges = true) {
  const m = /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
  if (ranges && m) {
    const start = Number(m[1]);
    if (start >= body.length) {
      res.writeHead(416);
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Length': body.length - start,
      'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}`,
    });
    res.end(body.subarray(start));
    return;
  }
  res.writeHead(200, { 'Content-Length': body.length });
  res.end(body);
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '';
    requests.push({ url, range: req.headers.range });
    if (url === '/grande.bin') serve(res, req, big);
    else if (url === '/pequeno.bin') serve(res, req, small);
    else if (url === '/sem-range.bin') serve(res, req, big, false);
    else if (url === '/range-errado.bin') {
      // Proxy defeituoso: responde 206, mas sempre do começo do arquivo.
      if (req.headers.range) {
        res.writeHead(206, {
          'Content-Length': big.length,
          'Content-Range': `bytes 0-${big.length - 1}/${big.length}`,
        });
        res.end(big);
      } else serve(res, req, big);
    } else if (url === '/cai-uma-vez.bin') {
      // Primeira tentativa: a conexão cai depois de 1 MB. Depois disso, serve normalmente (com Range).
      if (!failedOnce.has(url)) {
        failedOnce.add(url);
        res.writeHead(200, { 'Content-Length': big.length });
        res.write(big.subarray(0, 1024 * 1024), () => res.destroy());
      } else serve(res, req, big);
    } else if (url === '/truncado.bin') {
      res.writeHead(200, { 'Content-Length': big.length });
      res.write(big.subarray(0, 1024 * 1024), () => res.destroy());
    } else if (url === '/lento.bin') {
      res.writeHead(200, { 'Content-Length': big.length });
      let sent = 0;
      const timer = setInterval(() => {
        if (sent >= big.length || res.destroyed) return clearInterval(timer);
        res.write(big.subarray(sent, sent + 64 * 1024));
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
beforeEach(() => {
  requests.length = 0;
});
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const bigFile = (route: string, over: Partial<ModelFile> = {}): ModelFile => ({
  file: 'pesos.ckpt',
  url: `${base}/${route}`,
  sizeBytes: big.length,
  sha256: sha(big),
  ...over,
});
const smallFile = (over: Partial<ModelFile> = {}): ModelFile => ({
  file: 'config.yaml',
  url: `${base}/pequeno.bin`,
  sizeBytes: small.length,
  sha256: sha(small),
  ...over,
});
const model = (id: string, files: ModelFile[], extra: Partial<SeparationModel> = {}): SeparationModel => ({
  id,
  name: `Modelo ${id}`,
  stems: ['vocals'],
  files,
  ...extra,
});

function setup(models: SeparationModel[], dir = tmp()) {
  const paths = enginePaths(dir);
  const progress: ModelProgress[] = [];
  const downloader = new ModelDownloader(paths, (p) => progress.push(p), models);
  return { paths, progress, downloader };
}

const files = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);

describe('ModelDownloader (HTTP real)', () => {
  it('baixa vários modelos com progresso somado, confere SHA-256 e grava os arquivos gerados', async () => {
    const models = [
      model('a', [bigFile('grande.bin', { file: 'a.ckpt' }), smallFile({ file: 'a.yaml' })]),
      model('b', [smallFile({ file: 'b.yaml' })], {
        stems: ['drums', 'bass'],
        generated: [{ file: 'b.gerado', content: 'conteúdo fixo do modelo\n' }],
      }),
    ];
    const { paths, progress, downloader } = setup(models);
    const result = await downloader.download();
    const total = big.length + 2 * small.length;
    expect(result).toEqual({ sizeBytes: total, models: ['Modelo a', 'Modelo b'] });
    expect(fs.readFileSync(path.join(paths.modelsDir, 'a.ckpt')).equals(big)).toBe(true);
    expect(fs.readFileSync(path.join(paths.modelsDir, 'b.gerado'), 'utf8')).toBe('conteúdo fixo do modelo\n');
    expect(progress[0]).toEqual({ receivedBytes: 0, totalBytes: total, model: 'Modelo a' });
    expect(progress.at(-1)).toEqual({ receivedBytes: total, totalBytes: total, model: 'Modelo b' });
    const received = progress.map((p) => p.receivedBytes);
    expect(received).toEqual([...received].sort((x, y) => x - y));
    expect(detectModels(paths, models).map((m) => [m.id, m.ok, m.instruments])).toEqual([
      ['a', true, ['Voz']],
      ['b', true, ['Bateria', 'Baixo']],
    ]);
    expect(downloader.isRunning).toBe(false);
  });

  it('o que já está baixado não é baixado de novo', async () => {
    const dir = tmp();
    const models = [model('a', [bigFile('grande.bin')]), model('b', [smallFile()])];
    await setup(models, dir).downloader.download();
    requests.length = 0;
    const again = setup(models, dir);
    expect(await again.downloader.download()).toEqual({ sizeBytes: 0, models: [] });
    expect(requests).toEqual([]);
  });

  it('conexão que cai no meio deixa o parcial; a próxima tentativa continua de onde parou (Range)', async () => {
    const dir = tmp();
    const models = [model('a', [bigFile('cai-uma-vez.bin')])];
    const first = setup(models, dir);
    await expect(first.downloader.download()).rejects.toMatchObject({
      code: 'ENGINE_FAILED',
      message: expect.stringContaining('continua de onde parou'),
    });
    const partial = path.join(first.paths.modelsDir, 'pesos.ckpt.parcial');
    const have = fs.statSync(partial).size;
    expect(have).toBeGreaterThan(0);
    expect(have).toBeLessThan(big.length);
    requests.length = 0;
    const second = setup(models, dir);
    expect(await second.downloader.download()).toEqual({
      sizeBytes: big.length - have,
      models: ['Modelo a'],
    });
    expect(requests).toEqual([{ url: '/cai-uma-vez.bin', range: `bytes=${have}-` }]);
    expect(second.progress[0]?.receivedBytes).toBe(have);
    expect(fs.readFileSync(path.join(second.paths.modelsDir, 'pesos.ckpt')).equals(big)).toBe(true);
    expect(files(second.paths.modelsDir)).toEqual(['pesos.ckpt']);
  });

  it('servidor que ignora o Range: recomeça o arquivo do zero e termina íntegro', async () => {
    const dir = tmp();
    const paths = enginePaths(dir);
    fs.mkdirSync(paths.modelsDir, { recursive: true });
    fs.writeFileSync(path.join(paths.modelsDir, 'pesos.ckpt.parcial'), big.subarray(0, 5000));
    const { downloader } = setup([model('a', [bigFile('sem-range.bin')])], dir);
    await downloader.download();
    expect(fs.readFileSync(path.join(paths.modelsDir, 'pesos.ckpt')).equals(big)).toBe(true);
  });

  it('206 que começa em outro ponto (proxy defeituoso): recomeça do zero e termina íntegro', async () => {
    const dir = tmp();
    const paths = enginePaths(dir);
    fs.mkdirSync(paths.modelsDir, { recursive: true });
    fs.writeFileSync(path.join(paths.modelsDir, 'pesos.ckpt.parcial'), big.subarray(0, 5000));
    const { downloader } = setup([model('a', [bigFile('range-errado.bin')])], dir);
    await downloader.download();
    expect(fs.readFileSync(path.join(paths.modelsDir, 'pesos.ckpt')).equals(big)).toBe(true);
    expect(requests.map((r) => r.range)).toEqual(['bytes=5000-', undefined]);
  });

  it('parcial completo que não chegou a ser renomeado é conferido e aproveitado sem baixar', async () => {
    const dir = tmp();
    const paths = enginePaths(dir);
    fs.mkdirSync(paths.modelsDir, { recursive: true });
    fs.writeFileSync(path.join(paths.modelsDir, 'pesos.ckpt.parcial'), big);
    await setup([model('a', [bigFile('grande.bin')])], dir).downloader.download();
    expect(requests).toEqual([]);
    expect(files(paths.modelsDir)).toEqual(['pesos.ckpt']);
  });

  it('checksum diferente apaga o arquivo e explica', async () => {
    const { paths, downloader } = setup([model('a', [bigFile('grande.bin', { sha256: '0'.repeat(64) })])]);
    await expect(downloader.download()).rejects.toMatchObject({
      code: 'ENGINE_FAILED',
      message: expect.stringContaining('corrompido'),
      details: expect.stringContaining(sha(big)),
    });
    expect(files(paths.modelsDir)).toEqual([]);
  });

  it('arquivo maior que o esperado é descartado', async () => {
    const { paths, downloader } = setup([model('a', [bigFile('grande.bin', { sizeBytes: 1024 })])]);
    await expect(downloader.download()).rejects.toMatchObject({
      message: expect.stringContaining('maior que o esperado'),
    });
    expect(files(paths.modelsDir)).toEqual([]);
  });

  it('404 e servidor inalcançável viram mensagem de rede', async () => {
    await expect(
      setup([model('a', [bigFile('nao-existe.bin')])]).downloader.download(),
    ).rejects.toMatchObject({
      message: expect.stringContaining('sem conexão'),
      details: expect.stringContaining('HTTP 404'),
    });
    await expect(
      setup([model('a', [bigFile('x', { url: 'http://127.0.0.1:9/x.bin' })])]).downloader.download(),
    ).rejects.toMatchObject({ message: expect.stringContaining('sem conexão') });
  });

  it('cancelar interrompe, guarda o parcial para continuar depois e libera para tentar de novo', async () => {
    const { paths, progress, downloader } = setup([model('a', [bigFile('lento.bin')])]);
    const promise = downloader.download();
    await expect.poll(() => progress.length, { timeout: 5000 }).toBeGreaterThan(1);
    await expect(downloader.download()).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(downloader.cancel()).toBe(true);
    await expect(promise).rejects.toMatchObject({
      code: 'CANCELLED',
      message: 'Download dos modelos cancelado. O que já foi baixado é aproveitado na próxima vez.',
    });
    expect(files(paths.modelsDir)).toEqual(['pesos.ckpt.parcial']);
    expect(downloader.cancel()).toBe(false);
  });
});

describe('detecção dos modelos', () => {
  it('não baixado, incompleto, arquivo gerado alterado e pronto', () => {
    const paths = enginePaths(tmp());
    const m = model('a', [bigFile('grande.bin'), smallFile()], {
      generated: [{ file: 'g.yaml', content: 'x: 1\n' }],
    });
    const detail = () => detectModels(paths, [m])[0]?.detail;
    expect(detail()).toBe('Não baixado (3,0 MB).');
    fs.mkdirSync(paths.modelsDir, { recursive: true });
    fs.writeFileSync(path.join(paths.modelsDir, 'pesos.ckpt'), big);
    expect(detail()).toBe('Download incompleto (3,0 MB); baixe de novo.');
    fs.writeFileSync(path.join(paths.modelsDir, 'config.yaml'), small);
    expect(detail()).toBe('Arquivo de descrição ausente ou alterado (3,0 MB); baixe de novo.');
    fs.writeFileSync(path.join(paths.modelsDir, 'g.yaml'), 'x: 1\n');
    expect(detectModels(paths, [m])[0]).toMatchObject({ ok: true, detail: 'Baixado (3,0 MB)' });
  });

  it('motor antigo, só com o htdemucs_6s: os modelos novos aparecem como faltando, com o tamanho', () => {
    const paths = enginePaths(tmp());
    const legacy = SEPARATION_MODELS.find((m) => m.id === 'htdemucs_6s');
    expect(legacy).toBeDefined();
    fs.mkdirSync(paths.modelsDir, { recursive: true });
    for (const f of legacy?.files ?? []) {
      const fd = fs.openSync(path.join(paths.modelsDir, f.file), 'w');
      fs.ftruncateSync(fd, f.sizeBytes);
      fs.closeSync(fd);
    }
    for (const g of legacy?.generated ?? []) fs.writeFileSync(path.join(paths.modelsDir, g.file), g.content);
    const models = detectModels(paths);
    expect(models.map((m) => [m.id, m.ok, m.detail])).toEqual([
      ['melband-kim-ft2-bleedless', false, 'Não baixado (870,8 MB).'],
      ['bs-roformer-sw', false, 'Não baixado (667,0 MB).'],
      ['htdemucs_6s', true, 'Baixado (52,4 MB)'],
    ]);
    expect(summarizeModels(models)).toEqual({
      ok: false,
      detail: 'Falta baixar: MelBand-RoFormer Kim FT2 Bleedless, BS-Roformer-SW (1,5 GB).',
    });
  });
});

describe('erros de disco', () => {
  it.runIf(process.platform !== 'win32' && process.getuid?.() !== 0)(
    'pasta sem permissão de escrita: mensagem clara e liberado para tentar de novo',
    async () => {
      const { paths, downloader } = setup([model('a', [bigFile('grande.bin')])]);
      fs.mkdirSync(paths.modelsDir, { recursive: true });
      fs.chmodSync(paths.modelsDir, 0o500);
      try {
        await expect(downloader.download()).rejects.toMatchObject({
          code: 'IO',
          message: 'Sem permissão para gravar os modelos na pasta do motor.',
          details: expect.stringContaining('EACCES'),
        });
        expect(downloader.isRunning).toBe(false);
        await expect(downloader.download()).rejects.toMatchObject({ code: 'IO' });
      } finally {
        fs.chmodSync(paths.modelsDir, 0o700);
      }
      expect(files(paths.modelsDir)).toEqual([]);
    },
  );

  it.runIf(process.platform === 'linux' && fs.existsSync('/dev/full'))(
    'disco cheio no meio da gravação (ENOSPC real via /dev/full) não trava',
    async () => {
      const { paths, downloader } = setup([model('a', [bigFile('grande.bin')])]);
      fs.mkdirSync(paths.modelsDir, { recursive: true });
      fs.symlinkSync('/dev/full', path.join(paths.modelsDir, 'pesos.ckpt.parcial'));
      await expect(downloader.download()).rejects.toMatchObject({
        code: 'IO',
        message: expect.stringContaining('Sem espaço em disco'),
        details: expect.stringContaining('ENOSPC'),
      });
      expect(downloader.isRunning).toBe(false);
    },
  );

  it('caminho do motor inválido ao criar a pasta', async () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'arquivo'), 'x');
    const downloader = new ModelDownloader(enginePaths(path.join(dir, 'arquivo')), () => undefined, [
      model('a', [bigFile('grande.bin')]),
    ]);
    await expect(downloader.download()).rejects.toMatchObject({ code: 'IO' });
    expect(downloader.isRunning).toBe(false);
  });
});

describe('modelos reais no espelho oficial (DEC-017)', () => {
  it(
    'baixa os arquivos de configuração reais e confere tamanho e SHA-256',
    async () => {
      const configs = [VOCALS_MODEL, INSTRUMENTS_MODEL].map((m) => ({
        ...m,
        files: m.files.filter((f) => f.file.endsWith('.yaml')),
      }));
      const paths = enginePaths(tmp());
      const result = await new ModelDownloader(paths, () => undefined, configs).download();
      expect(result.models).toEqual([VOCALS_MODEL.name, INSTRUMENTS_MODEL.name]);
      expect(files(paths.modelsDir)).toEqual([
        'BS-Roformer-SW.yaml',
        'config_mel_band_roformer_kim_ft_unwa.yaml',
      ]);
    },
    2 * 60_000,
  );

  it(
    'os pesos existem no espelho com o tamanho registrado e aceitam Range (retomada)',
    async () => {
      for (const f of [...VOCALS_MODEL.files, ...INSTRUMENTS_MODEL.files].filter((x) =>
        x.file.endsWith('.ckpt'),
      )) {
        const res = await fetch(f.url, { headers: { Range: 'bytes=0-0' } });
        expect({ file: f.file, status: res.status }).toEqual({ file: f.file, status: 206 });
        expect(res.headers.get('content-range')).toBe(`bytes 0-0/${f.sizeBytes}`);
        await res.arrayBuffer();
      }
    },
    2 * 60_000,
  );
});
