export const APP_SCHEME = 'app';
export const APP_HOST = 'bundle';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** CSP do app empacotado: nada externo, nada inline, áudio só via protocolo media://. */
export const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self' media:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** CSP de desenvolvimento: o Vite precisa do script inline do React Refresh e de WebSocket para HMR. */
export function devCsp(devOrigin: string): string {
  const ws = devOrigin.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "media-src 'self' media:",
    `connect-src 'self' ${ws}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * O renderer só pode navegar dentro da origem do próprio app.
 * Compara protocolo, host e porta explicitamente: no Node, `URL.origin` de esquemas não especiais
 * (app:, file:) é sempre "null", e comparar origens deixaria qualquer um deles passar.
 */
export function isAllowedNavigation(target: string, allowedOrigin: string): boolean {
  try {
    const a = new URL(target);
    const b = new URL(allowedOrigin);
    return a.protocol === b.protocol && a.host === b.host && a.host !== '';
  } catch {
    return false;
  }
}

/**
 * Requisições que o renderer pode fazer: só os arquivos do app (app://), os áudios liberados (media://)
 * e, em desenvolvimento, o servidor do Vite em localhost. Nada mais sai para a rede (RN-12).
 */
export function isAllowedRendererRequest(target: string, devOrigin: string | null): boolean {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.protocol === `${APP_SCHEME}:`) return url.host === APP_HOST;
  if (url.protocol === 'media:') return true;
  if (devOrigin) {
    const dev = new URL(devOrigin);
    const sameHost = url.hostname === dev.hostname && url.port === dev.port;
    if (sameHost && ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return true;
  }
  return false;
}
