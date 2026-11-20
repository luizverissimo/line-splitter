import { describe, expect, it } from 'vitest';
import './zod-locale';
import { settingsSchema, settingsUpdateSchema } from './settings';

const valid = {
  outputDir: '/home/u/Música/Line Splitter',
  bitrateKbps: 320,
  device: 'auto',
  pythonPath: '',
  ffmpegPath: '',
};

describe('settingsSchema', () => {
  it('aceita configuração válida, inclusive caminhos do Windows', () => {
    expect(settingsSchema.parse(valid)).toEqual(valid);
    expect(
      settingsSchema.parse({
        ...valid,
        outputDir: 'C:\\Users\\u\\Music',
        pythonPath: 'C:/Python312/python.exe',
      }),
    ).toMatchObject({ pythonPath: 'C:/Python312/python.exe' });
  });

  it('rejeita valores fora das regras com mensagens em português', () => {
    const r = settingsSchema.safeParse({ ...valid, bitrateKbps: 128, device: 'tpu', outputDir: 'relativo' });
    expect(r.success).toBe(false);
    const messages = r.error?.issues.map((i) => i.message) ?? [];
    expect(messages).toContain('Escolha 192, 256 ou 320 kbps.');
    expect(messages).toContain('Escolha Automático, GPU ou CPU.');
    expect(messages).toContain('A pasta de saída precisa ser um caminho absoluto.');
  });

  it('caminho de Python relativo é recusado; vazio significa detectar', () => {
    expect(settingsSchema.safeParse({ ...valid, pythonPath: 'python3' }).error?.issues[0]?.message).toBe(
      'O caminho do Python precisa ser absoluto.',
    );
    expect(settingsSchema.safeParse({ ...valid, ffmpegPath: '' }).success).toBe(true);
  });
});

describe('settingsUpdateSchema', () => {
  it('aceita atualização parcial e recusa vazia', () => {
    expect(settingsUpdateSchema.parse({ bitrateKbps: 192 })).toEqual({ bitrateKbps: 192 });
    expect(settingsUpdateSchema.safeParse({}).success).toBe(false);
  });
});
