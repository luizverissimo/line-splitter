import { expect, launchApp, test } from './app';

test('janelas seguras: preferências, CSP, navegação, novas janelas, webview e permissões negadas', async ({
  userData,
}) => {
  const { app, page } = await launchApp(userData);
  try {
    await expect(page.locator('footer')).toContainText('Line Splitter');
    // Sem motor instalado o app abre na tela Motor; espera esse redirecionamento terminar.
    await expect(page.getByRole('heading', { level: 1, name: 'Motor de separação' })).toBeVisible();

    // Todas as janelas abertas com as preferências seguras.
    const prefs = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((w) => {
        // getLastWebPreferences existe em tempo de execução, mas não está nos tipos do Electron 45.
        const wc = w.webContents as unknown as {
          getLastWebPreferences: () => Record<string, unknown> | undefined;
        };
        const p = wc.getLastWebPreferences();
        return { ci: p?.contextIsolation, ni: p?.nodeIntegration, sb: p?.sandbox, wv: p?.webviewTag };
      }),
    );
    expect(prefs.length).toBeGreaterThan(0);
    for (const p of prefs) expect(p).toEqual({ ci: true, ni: false, sb: true, wv: false });

    // CSP restritiva no documento servido.
    const csp = await page.evaluate(async () =>
      (await fetch(location.href)).headers.get('content-security-policy'),
    );
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);

    // Sem acesso a Node no renderer.
    expect(
      await page.evaluate(() => [typeof window.require, typeof (window as { process?: unknown }).process]),
    ).toEqual(['undefined', 'undefined']);

    // window.open é negado e nenhuma janela nova aparece.
    expect(await page.evaluate(() => window.open('https://example.com') === null)).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

    // Navegar para fora da origem do app é bloqueado.
    const before = page.url();
    await page.evaluate(() => {
      window.location.href = 'https://example.com/';
    });
    await page.waitForTimeout(500);
    expect(page.url()).toBe(before);

    // <webview> não é criado (webviewTag desligado).
    expect(
      await page.evaluate(() => {
        const wv = document.createElement('webview') as HTMLElement & { getWebContentsId?: unknown };
        document.body.append(wv);
        const ok = typeof wv.getWebContentsId === 'function';
        wv.remove();
        return ok;
      }),
    ).toBe(false);

    // Permissões (câmera, microfone, notificações, localização) negadas.
    const permissions = await page.evaluate(async () => {
      const media = await navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(() => 'concedido')
        .catch((e: Error) => `negado: ${e.name}`);
      const notif = await Notification.requestPermission();
      return { media, notif };
    });
    expect(permissions.media).toMatch(/^negado/);
    expect(permissions.notif).not.toBe('granted');
  } finally {
    await app.close();
  }
});
