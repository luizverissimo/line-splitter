import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { MediaRegistry } from './registry';

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
};

export interface ByteRange {
  start: number;
  end: number;
}

/** Interpreta um cabeçalho `Range: bytes=...` (um único intervalo). null = inválido/insatisfatível. */
export function parseRange(header: string, size: number): ByteRange | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size === 0) return null;
  const [, startText = '', endText = ''] = match;
  if (startText === '' && endText === '') return null;
  let start: number;
  let end: number;
  if (startText === '') {
    const suffix = Number(endText);
    if (suffix === 0) return null;
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText === '' ? size - 1 : Math.min(Number(endText), size - 1);
  }
  if (start > end || start >= size) return null;
  return { start, end };
}

const body = (file: string, range?: ByteRange) =>
  Readable.toWeb(fs.createReadStream(file, range)) as ReadableStream<Uint8Array>;

/** Responde uma requisição `media://` servindo só arquivos liberados no registro, com suporte a Range. */
export function serveMedia(request: Request, registry: MediaRegistry): Response {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Método não permitido', { status: 405 });
  }
  const file = registry.resolve(request.url);
  if (!file) return new Response('Mídia não permitida', { status: 403 });

  let size: number;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return new Response('Não encontrado', { status: 404 });
    size = stat.size;
  } catch {
    return new Response('Não encontrado', { status: 404 });
  }

  const headers = new Headers({
    'Content-Type': AUDIO_MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  });
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const range = parseRange(rangeHeader, size);
    if (!range) {
      headers.set('Content-Range', `bytes */${size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    headers.set('Content-Length', String(range.end - range.start + 1));
    return new Response(request.method === 'HEAD' ? null : body(file, range), { status: 206, headers });
  }
  headers.set('Content-Length', String(size));
  return new Response(request.method === 'HEAD' ? null : body(file), { status: 200, headers });
}
