import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mimeFor, resolveStaticPath } from './static-files';

const root = path.resolve('/opt/app/renderer');

describe('resolveStaticPath', () => {
  it('resolve arquivos dentro da pasta', () => {
    expect(resolveStaticPath(root, '/')).toBe(path.join(root, 'index.html'));
    expect(resolveStaticPath(root, '/assets/index-abc.js')).toBe(path.join(root, 'assets/index-abc.js'));
    expect(resolveStaticPath(root, '/assets/com%20espa%C3%A7o.css')).toBe(
      path.join(root, 'assets/com espaço.css'),
    );
  });

  it('bloqueia path traversal e bytes nulos', () => {
    expect(resolveStaticPath(root, '/../../etc/passwd')).toBeNull();
    expect(resolveStaticPath(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
    expect(resolveStaticPath(root, '/assets/%00.js')).toBeNull();
    expect(resolveStaticPath(root, '/%E0%A4%A')).toBeNull();
    expect(resolveStaticPath('/opt/app/renderer', '/../renderer-outra/x.js')).toBeNull();
  });
});

describe('mimeFor', () => {
  it('conhece os tipos do build', () => {
    expect(mimeFor('index.html')).toMatch(/^text\/html/);
    expect(mimeFor('a.js')).toMatch(/^text\/javascript/);
    expect(mimeFor('a.CSS')).toMatch(/^text\/css/);
    expect(mimeFor('a.bin')).toBe('application/octet-stream');
  });
});
