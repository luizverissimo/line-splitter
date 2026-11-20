import { net, protocol } from 'electron';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { APP_HOST, APP_SCHEME, PROD_CSP } from './security';
import { mimeFor, resolveStaticPath } from './static-files';

/** Precisa rodar antes do `app.ready`. */
export function registerAppSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Serve o build do web em app://bundle/ com CSP restritiva. */
export function serveRenderer(rendererDir: string): void {
  if (!fs.existsSync(`${rendererDir}/index.html`)) {
    throw new Error(
      `Build da interface não encontrado em ${rendererDir}. Rode "pnpm --filter @line-splitter/web build".`,
    );
  }
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.host !== APP_HOST) return new Response('Origem não permitida', { status: 403 });
    const file = resolveStaticPath(rendererDir, url.pathname);
    if (!file) return new Response('Caminho não permitido', { status: 403 });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile())
      return new Response('Não encontrado', { status: 404 });
    const upstream = await net.fetch(pathToFileURL(file).toString());
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': mimeFor(file),
        'Content-Security-Policy': PROD_CSP,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });
}
