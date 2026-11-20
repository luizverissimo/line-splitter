import { describe, expect, it } from 'vitest';
import './zod-locale';
import { INSTRUMENTS, STEMS, instrumentOf, stemSchema } from './instruments';

describe('instrumentos (PRD §5.3)', () => {
  it('mapeia cada opção da tela para o stem do Demucs', () => {
    expect(INSTRUMENTS.map((i) => [i.label, i.stem])).toEqual([
      ['Voz', 'vocals'],
      ['Bateria', 'drums'],
      ['Baixo', 'bass'],
      ['Guitarra/Violão', 'guitar'],
      ['Piano/Teclado', 'piano'],
    ]);
    expect(STEMS).toEqual(INSTRUMENTS.map((i) => i.stem));
  });

  it('nomes de arquivo não têm caracteres proibidos', () => {
    for (const i of INSTRUMENTS) expect(i.fileLabel).not.toMatch(/[<>:"/\\|?*]/);
    expect(instrumentOf('guitar').fileLabel).toBe('Guitarra-Violão');
    expect(instrumentOf('piano').fileLabel).toBe('Piano-Teclado');
  });

  it('valida o stem com mensagem em português', () => {
    expect(stemSchema.parse('vocals')).toBe('vocals');
    expect(stemSchema.safeParse('other').error?.issues[0]?.message).toBe('Escolha um instrumento válido.');
  });
});
