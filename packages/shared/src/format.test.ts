import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration } from './format';

describe('formatDuration', () => {
  it('formata minutos e segundos', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(599)).toBe('9:59');
  });
  it('formata horas', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
  it('rejeita valores inválidos', () => {
    expect(() => formatDuration(-1)).toThrow(RangeError);
    expect(() => formatDuration(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatBytes', () => {
  it('formata em unidades', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(500 * 1024 * 1024)).toBe('500,0 MB');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2,5 GB');
    expect(formatBytes(3072 * 1024 ** 3)).toBe('3072,0 GB');
  });
  it('arredonda bytes fracionários', () => {
    expect(formatBytes(512.5)).toBe('513 B');
    expect(formatBytes(0.4)).toBe('0 B');
  });
  it('rejeita valores inválidos', () => {
    expect(() => formatBytes(-5)).toThrow(RangeError);
  });
});
