import { expect, launchApp, test } from './app';

test.describe('protocolo media:// no Electron real', () => {
  test('nega mídia não liberada e não expõe arquivos do disco', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await expect(page.locator('footer')).toContainText('Line Splitter');
      expect(await app.evaluate(({ protocol }) => protocol.isProtocolHandled('media'))).toBe(true);
      const statuses = await page.evaluate(async () => {
        const status = async (url: string) => {
          try {
            return (await fetch(url)).status;
          } catch {
            return 'bloqueado';
          }
        };
        return {
          desconhecido: await status('media://audio/token-inexistente'),
          outroHost: await status('media://etc/passwd'),
          arquivo: await status('file:///etc/passwd'),
        };
      });
      // fetch()/XHR não alcançam media:// nem file:// (connect-src 'self'); só o <audio> usa media-src.
      expect(statuses).toEqual({ desconhecido: 'bloqueado', outroHost: 'bloqueado', arquivo: 'bloqueado' });

      const audioError = await page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const audio = new Audio('media://audio/token-inexistente');
            audio.addEventListener('error', () => resolve(`erro ${audio.error?.code ?? '?'}`));
            audio.addEventListener('loadedmetadata', () => resolve('carregou'));
          }),
      );
      // 403 do handler → MEDIA_ERR_SRC_NOT_SUPPORTED (4).
      expect(audioError).toBe('erro 4');
    } finally {
      await app.close();
    }
  });
});
