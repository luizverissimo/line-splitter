import { protocol } from 'electron';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import { APP_HOST, APP_SCHEME, PROD_CSP } from './security';
import { mimeFor, resolveStaticPath } from './static-files';
import { MEDIA_SCHEME, type MediaRegistry } from './media/registry';
import { serveMedia } from './media/serve';

/** Precisa rodar antes do `app.ready`. */
export function registerAppSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
    // stream: true permite ao <audio> buscar trechos (Range) e avançar/voltar na faixa.
    { scheme: MEDIA_SCHEME, privileges: { secure: true, stream: true, supportFetchAPI: true } },
  ]);
}

/** Serve o build do web em app://bundle/ com CSP restritiva. */
export function serveRenderer(rendererDir: string): void {
  if (!fs.existsSync(`${rendererDir}/index.html`)) {
    throw new Error(
      `Build da interface não encontrado em ${rendererDir}. Rode "pnpm --filter @line-splitter/web build".`,
    );
  }
  protocol.handle(APP_SCHEME, (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Origem não permitida', { status: 403 });
    const file = resolveStaticPath(rendererDir, url.pathname);
    if (!file) return new Response('Caminho não permitido', { status: 403 });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile())
      return new Response('Não encontrado', { status: 404 });
    // Lido direto do disco (não via net.fetch de file://, que passaria pelo bloqueio de rede da sessão).
    const body = Readable.toWeb(fs.createReadStream(file)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': mimeFor(file),
        'Content-Security-Policy': PROD_CSP,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}

/** Serve os áudios liberados no registro em media://audio/<token>. */
export function serveMediaProtocol(registry: MediaRegistry): void {
  protocol.handle(MEDIA_SCHEME, (request) => serveMedia(request, registry));
}
