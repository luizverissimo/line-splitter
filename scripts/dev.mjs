// Desenvolvimento: Vite (web) com HMR + Electron apontando para ele.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEV_URL = 'http://localhost:5173';
const children = [];

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', ...opts });
  children.push(child);
  return child;
}

function waitForPort(port, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, 'localhost');
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started > timeoutMs) reject(new Error(`Vite não respondeu na porta ${port}`));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

function shutdown(code) {
  for (const child of children) if (!child.killed) child.kill();
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const build = run('pnpm', ['--filter', '@line-splitter/desktop', 'build']);
const buildCode = await new Promise((resolve) => build.on('exit', resolve));
if (buildCode !== 0) shutdown(buildCode ?? 1);

const vite = run('pnpm', ['--filter', '@line-splitter/web', 'dev']);
vite.on('exit', (code) => shutdown(code ?? 0));
await waitForPort(5173, 30_000);

const app = run('node', ['apps/desktop/scripts/start.mjs'], {
  env: { ...process.env, LINE_SPLITTER_DEV_URL: DEV_URL },
});
app.on('exit', (code) => shutdown(code ?? 0));
