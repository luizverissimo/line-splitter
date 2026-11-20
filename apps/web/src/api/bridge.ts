import { AppError, type DesktopBridge } from '@line-splitter/shared';

declare global {
  interface Window {
    api?: DesktopBridge;
  }
}

/** Devolve a ponte exposta pelo preload; sem ela o app não está rodando dentro do Electron. */
export function getBridge(): DesktopBridge {
  const bridge = window.api;
  if (!bridge) {
    throw new AppError(
      'INTERNAL',
      'Ponte com o aplicativo indisponível. Abra o Line Splitter pelo aplicativo desktop.',
    );
  }
  return bridge;
}
