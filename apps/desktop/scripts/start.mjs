// Abre o app com o build atual do web e do desktop (sem Vite).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { devElectronArgs } from './sandbox.mjs';

const desktopDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const binary = /** @type {string} */ (/** @type {unknown} */ (electron));
let extraArgs;
try {
  extraArgs = devElectronArgs(binary);
} catch (err) {
  console.error(`\n[line-splitter] ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
const child = spawn(binary, [...extraArgs, desktopDir], { stdio: 'inherit', env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
