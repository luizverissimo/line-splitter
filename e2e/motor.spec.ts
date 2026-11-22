import { expect, launchApp, test } from './app';

test.describe('Tela Motor', () => {
  test('na abertura sem motor instalado vai para a tela Motor com o status real', async ({ userData }) => {
    const { app, page } = await launchApp(userData);
    try {
      await expect(page.getByRole('heading', { level: 1, name: 'Motor de separação' })).toBeVisible();
      await expect(
        page.getByText('O motor ainda não está pronto. Resolva os itens marcados abaixo.'),
      ).toBeVisible();
      const items = page.getByRole('list', { name: 'Itens do motor' }).getByRole('listitem');
      await expect(items.nth(0)).toContainText(/Python: pronto\s*Python 3\.\d+\.\d+/);
      await expect(items.nth(1)).toContainText(/FFmpeg: pronto\s*FFmpeg \S+ · ffprobe \S+/);
      await expect(items.nth(2)).toContainText('Motor não instalado (ambiente Python do app ausente).');
      await expect(items.nth(3)).toContainText(
        'Modelo MelBand-RoFormer Kim FT2 Bleedless · Voz: com problema',
      );
      await expect(items.nth(3)).toContainText('Não baixado (870,8 MB).');
      await expect(items.nth(4)).toContainText('Não baixado (667,0 MB).');
      await expect(items.nth(5)).toContainText('Não baixado (52,4 MB).');
      await expect(items).toHaveCount(6);
      await expect(page.getByText(/Dispositivo em uso:/)).toContainText(
        'definido depois de instalar o motor',
      );
    } finally {
      await app.close();
    }
  });

  test('Python inválido nas Configurações aparece com ✖, instruções e "Verificar de novo"', async ({
    userData,
  }) => {
    const { app, page } = await launchApp(userData);
    try {
      await page.getByRole('link', { name: 'Configurações' }).click();
      // Executável que existe mas não é Python: passa na validação do caminho e falha na verificação do motor.
      await page.getByLabel('Caminho do Python').fill('/bin/false');
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
    } finally {
      await app.close();
    }

    // Reabrindo, o app leva sozinho à tela Motor, com o Python marcado.
    const reopened = await launchApp(userData);
    try {
      const page = reopened.page;
      await expect(page.getByRole('heading', { level: 1, name: 'Motor de separação' })).toBeVisible();
      const python = page.getByRole('list', { name: 'Itens do motor' }).getByRole('listitem').nth(0);
      await expect(python).toContainText('Python: com problema');
      await expect(python).toContainText('Não foi possível executar /bin/false');
      await expect(page.getByRole('heading', { name: 'Instalar o Python no Linux' })).toBeVisible();
      await expect(page.getByText('sudo apt install python3 python3-venv')).toBeVisible();

      await page.getByRole('link', { name: 'Configurações' }).click();
      await page.getByRole('button', { name: 'Usar detecção automática' }).first().click();
      await page.getByRole('button', { name: 'Salvar configurações' }).click();
      await expect(page.getByText('Configurações salvas.')).toBeVisible();
      await page.getByRole('link', { name: 'Motor' }).click();
      await page.getByRole('button', { name: 'Verificar de novo' }).click();
      await expect(python).toContainText('Python: pronto');
      await expect(page.getByRole('heading', { name: 'Instalar o Python no Linux' })).toHaveCount(0);
    } finally {
      await reopened.app.close();
    }
  });
});
