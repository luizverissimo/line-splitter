import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from './errors';
import { createIpc, type IpcTransport } from './ipc';

const channels = {
  'soma:calcular': {
    input: z.object({ a: z.number(), b: z.number() }),
    output: z.object({ total: z.number() }),
  },
  'texto:eco': { input: z.string().min(1), output: z.string() },
  'nada:fazer': { input: z.undefined(), output: z.literal('ok') },
};
const events = {
  'progresso:mudou': z.object({ percent: z.number().min(0).max(100) }),
};
const ipc = createIpc(channels, events);

/** Transporte que liga o invoke diretamente aos handlers, como o ipcRenderer.invoke + ipcMain.handle fariam. */
function wire(handlers: Record<string, (raw: unknown) => Promise<unknown>>): IpcTransport {
  return async (channel, payload) => {
    const handler = handlers[channel];
    if (!handler) throw new Error(`sem handler para ${channel}`);
    return handler(structuredClone(payload));
  };
}

describe('defineHandler', () => {
  it('valida a entrada e devolve envelope de sucesso', async () => {
    const h = ipc.defineHandler('soma:calcular', ({ a, b }) => ({ total: a + b }));
    await expect(h({ a: 2, b: 3 })).resolves.toEqual({ ok: true, data: { total: 5 } });
  });

  it('rejeita payload inválido com código VALIDATION e mensagem em português', async () => {
    const h = ipc.defineHandler('soma:calcular', ({ a, b }) => ({ total: a + b }));
    const result = await h({ a: 'dois', b: 3 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.message).toMatch(/^a: /);
    expect(result.error.message).toMatch(/esperado|inválid/i);
  });

  it('acusa resposta fora do schema como INVALID_RESPONSE', async () => {
    const h = ipc.defineHandler('soma:calcular', () => ({ total: 'muito' }) as unknown as { total: number });
    const result = await h({ a: 1, b: 1 });
    expect(result).toMatchObject({ ok: false, error: { code: 'INVALID_RESPONSE' } });
  });

  it('preserva AppError lançado pelo handler', async () => {
    const h = ipc.defineHandler('texto:eco', () => {
      throw new AppError('NOT_FOUND', 'Arquivo não encontrado.', '/x.mp3');
    });
    await expect(h('oi')).resolves.toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Arquivo não encontrado.', details: '/x.mp3' },
    });
  });

  it('converte erro inesperado em INTERNAL com detalhe técnico', async () => {
    const h = ipc.defineHandler('texto:eco', () => {
      throw new Error('falha de disco');
    });
    await expect(h('oi')).resolves.toEqual({
      ok: false,
      error: { code: 'INTERNAL', message: 'Erro interno inesperado.', details: 'falha de disco' },
    });
  });

  it('trata ZodError interno do handler como INTERNAL, não como erro de entrada', async () => {
    const h = ipc.defineHandler('texto:eco', () => z.string().parse(42));
    await expect(h('oi')).resolves.toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });

  it('recusa canal fora do contrato', () => {
    expect(() => ipc.defineHandler('inexistente' as 'texto:eco', () => 'x')).toThrow(/desconhecido/);
  });
});

describe('invoke', () => {
  const transport = wire({
    'soma:calcular': ipc.defineHandler('soma:calcular', ({ a, b }) => ({ total: a + b })),
    'texto:eco': ipc.defineHandler('texto:eco', (s) => s),
    'nada:fazer': ipc.defineHandler('nada:fazer', () => 'ok' as const),
  });

  it('faz a ida e volta tipada', async () => {
    await expect(ipc.invoke(transport, 'soma:calcular', { a: 4, b: 6 })).resolves.toEqual({ total: 10 });
    await expect(ipc.invoke(transport, 'nada:fazer', undefined)).resolves.toBe('ok');
  });

  it('valida no cliente antes de enviar', async () => {
    let sent = false;
    const spy: IpcTransport = async () => {
      sent = true;
      return { ok: true, data: 'x' };
    };
    await expect(ipc.invoke(spy, 'texto:eco', '')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(sent).toBe(false);
  });

  it('lança AppError com o erro vindo do main', async () => {
    const t = wire({
      'texto:eco': ipc.defineHandler('texto:eco', () => {
        throw new AppError('CONFLICT', 'Já existe uma separação em andamento.');
      }),
    });
    const err = await ipc.invoke(t, 'texto:eco', 'oi').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'CONFLICT', message: 'Já existe uma separação em andamento.' });
  });

  it('rejeita envelope malformado e dado fora do schema', async () => {
    const malformed: IpcTransport = async () => ({ qualquer: 1 });
    await expect(ipc.invoke(malformed, 'texto:eco', 'oi')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
    const wrongData: IpcTransport = async () => ({ ok: true, data: 42 });
    await expect(ipc.invoke(wrongData, 'texto:eco', 'oi')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('eventos', () => {
  it('valida payload ao emitir e ao receber', () => {
    expect(ipc.encodeEvent('progresso:mudou', { percent: 40 })).toEqual({ percent: 40 });
    expect(() => ipc.encodeEvent('progresso:mudou', { percent: 140 })).toThrow(AppError);
    expect(ipc.decodeEvent('progresso:mudou', { percent: 10 })).toEqual({ percent: 10 });
    expect(ipc.decodeEvent('progresso:mudou', { percent: 'x' })).toBeNull();
  });

  it('identifica canais e eventos do contrato', () => {
    expect(ipc.isChannel('texto:eco')).toBe(true);
    expect(ipc.isChannel('fs:apagarTudo')).toBe(false);
    expect(ipc.isEvent('progresso:mudou')).toBe(true);
  });
});
