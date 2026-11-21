import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };

const desktopDir = path.resolve(import.meta.dirname, '../..');
const pngSize = (file: string) => {
  const b = fs.readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

describe('identidade do app', () => {
  it('ícones existem nos tamanhos pedidos (PNG 512/256 e ICO)', () => {
    expect(pngSize(path.join(desktopDir, 'build/icon.png'))).toEqual([512, 512]);
    expect(pngSize(path.join(desktopDir, 'build/icon-256.png'))).toEqual([256, 256]);
    const ico = fs.readFileSync(path.join(desktopDir, 'build/icon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBeGreaterThanOrEqual(5);
  });

  it('instaladores usam o nome "Line Splitter" e os ícones, inclusive no .desktop do Linux', () => {
    expect(pkg.productName).toBe('Line Splitter');
    expect(pkg.build.productName).toBe('Line Splitter');
    expect(pkg.build.linux.icon).toBe('build/icon.png');
    expect(pkg.build.win.icon).toBe('build/icon.ico');
    expect(pkg.build.linux.desktop.entry.Name).toBe('Line Splitter');
    expect(pkg.build.extraResources).toContainEqual({ from: 'build/icon.png', to: 'icon.png' });
  });
});
