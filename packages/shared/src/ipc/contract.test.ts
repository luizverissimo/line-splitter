import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ipc, ipcChannels } from './contract';

describe('contrato IPC', () => {
  it('todo canal tem schema de entrada e de saída', () => {
    const invalid = Object.entries(ipcChannels)
      .filter(([, def]) => !(def.input instanceof z.ZodType) || !(def.output instanceof z.ZodType))
      .map(([name]) => name);
    expect(invalid).toEqual([]);
  });

  it('app:info não aceita argumentos e valida a resposta', async () => {
    const h = ipc.defineHandler('app:info', () => ({
      name: 'Line Splitter',
      version: '0.1.0',
      platform: 'linux' as const,
      electron: '38.0.0',
    }));
    await expect(h(undefined)).resolves.toMatchObject({ ok: true });
    await expect(h({ extra: true })).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  });
});
