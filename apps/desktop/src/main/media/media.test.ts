import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixtures } from '../../../../../scripts/fixtures.mjs';
import { MediaRegistry } from './registry';
import { parseRange, serveMedia } from './serve';

describe('MediaRegistry', () => {
  it('gera URL opaca por arquivo e resolve de volta', () => {
    const reg = new MediaRegistry();
    const url = reg.register(fixtures.wav);
    expect(url).toMatch(/^media:\/\/audio\/[A-Za-z0-9_-]{24}$/);
    expect(url).not.toContain('musica');
    expect(reg.register(fixtures.wav)).toBe(url);
    expect(reg.resolve(url)).toBe(fixtures.wav);
    expect(reg.has(fixtures.wav)).toBe(true);
  });

  it('recusa caminho relativo e URLs desconhecidas', () => {
    const reg = new MediaRegistry();
    expect(() => reg.register('musica.mp3')).toThrow(/absoluto/);
    expect(reg.resolve('media://audio/inexistente')).toBeNull();
    expect(reg.resolve('media://outro/x')).toBeNull();
    expect(reg.resolve('file:///etc/passwd')).toBeNull();
    expect(reg.resolve('lixo')).toBeNull();
  });

  it('revogar invalida a URL', () => {
    const reg = new MediaRegistry();
    const url = reg.register(fixtures.mp3);
    reg.unregister(fixtures.mp3);
    expect(reg.resolve(url)).toBeNull();
    expect(reg.has(fixtures.mp3)).toBe(false);
  });
});

describe('parseRange', () => {
  it('interpreta intervalos válidos', () => {
    expect(parseRange('bytes=0-99', 1000)).toEqual({ start: 0, end: 99 });
    expect(parseRange('bytes=900-', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=990-5000', 1000)).toEqual({ start: 990, end: 999 });
  });

  it('recusa intervalos inválidos', () => {
    expect(parseRange('bytes=1000-', 1000)).toBeNull();
    expect(parseRange('bytes=50-10', 1000)).toBeNull();
    expect(parseRange('bytes=-', 1000)).toBeNull();
    expect(parseRange('bytes=0-1,5-6', 1000)).toBeNull();
    expect(parseRange('itens=0-1', 1000)).toBeNull();
  });
});

describe('serveMedia', () => {
  const size = () => fs.statSync(fixtures.wav).size;

  it('serve arquivo liberado inteiro com tipo correto', async () => {
    const reg = new MediaRegistry();
    const res = serveMedia(new Request(reg.register(fixtures.wav)), reg);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('audio/wav');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.length).toBe(size());
    expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe('RIFF');
  });

  it('responde Range com 206 e o trecho exato', async () => {
    const reg = new MediaRegistry();
    const url = reg.register(fixtures.wav);
    const res = serveMedia(new Request(url, { headers: { Range: 'bytes=8-11' } }), reg);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe(`bytes 8-11/${size()}`);
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('WAVE');
  });

  it('Range insatisfatível devolve 416', () => {
    const reg = new MediaRegistry();
    const url = reg.register(fixtures.wav);
    const res = serveMedia(new Request(url, { headers: { Range: `bytes=${size()}-` } }), reg);
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe(`bytes */${size()}`);
  });

  it('nega o que não foi liberado (403) e arquivo apagado (404)', () => {
    const reg = new MediaRegistry();
    expect(serveMedia(new Request('media://audio/qualquer'), reg).status).toBe(403);
    const ghost = `${fixtures.wav}.apagado.wav`;
    expect(serveMedia(new Request(reg.register(ghost)), reg).status).toBe(404);
  });

  it('recusa métodos de escrita', () => {
    const reg = new MediaRegistry();
    const url = reg.register(fixtures.mp3);
    expect(serveMedia(new Request(url, { method: 'POST', body: 'x' }), reg).status).toBe(405);
  });
});
