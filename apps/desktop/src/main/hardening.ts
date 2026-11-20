import { app, session, type WebContents } from 'electron';
import { devCsp, isAllowedNavigation } from './security';

/**
 * Regras aplicadas a todo WebContents criado: sem novas janelas, sem navegação para fora da origem do app,
 * sem <webview>, e nenhuma permissão (câmera, microfone, notificações…) concedida.
 */
export function hardenApp(allowedOrigin: string, devOrigin: string | null): void {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  if (devOrigin) {
    const csp = devCsp(devOrigin);
    session.defaultSession.webRequest.onHeadersReceived({ urls: [`${devOrigin}/*`] }, (details, callback) => {
      callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
    });
  }

  app.on('web-contents-created', (_event, contents: WebContents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url, allowedOrigin)) event.preventDefault();
    });
    contents.on('will-redirect', (event, url) => {
      if (!isAllowedNavigation(url, allowedOrigin)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}
