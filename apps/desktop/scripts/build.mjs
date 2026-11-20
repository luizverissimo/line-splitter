// Empacota o processo principal e o preload com esbuild.
// O preload roda com sandbox: precisa ser um único arquivo CommonJS sem dependências externas além de "electron".
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  external: ['electron', 'better-sqlite3'],
};

await build({
  ...common,
  entryPoints: [path.join(root, 'src/main/index.ts')],
  outfile: path.join(root, 'out/main.cjs'),
});
await build({
  ...common,
  external: ['electron'],
  entryPoints: [path.join(root, 'src/preload/index.ts')],
  outfile: path.join(root, 'out/preload.cjs'),
});
