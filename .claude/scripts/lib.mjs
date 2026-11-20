// Leitura do plano (docs/TASKS.md, docs/REQUISITOS.md) e estado do autopilot.
// Usado pelos hooks e pelo CLI tasks.mjs. Sem dependências externas.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

export const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const p = (...parts) => path.join(ROOT, ...parts);

export const PATHS = {
  prd: p('docs', 'PRD.md'),
  tasks: p('docs', 'TASKS.md'),
  reqs: p('docs', 'REQUISITOS.md'),
  progress: p('docs', 'PROGRESSO.md'),
  decisions: p('docs', 'DECISOES.md'),
  config: p('.claude', 'guard.config.json'),
  state: p('.claude', 'state'),
  autopilot: p('.claude', 'state', 'autopilot.on'),
  stopState: p('.claude', 'state', 'stop-guard.json'),
  registry: p('.claude', 'task-ids.json'),
};

export const read = (file) => {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
};

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};

const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
};

export const loadConfig = () => readJson(PATHS.config, {});

export const readStdinJson = async () => {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
};

// ---------- TASKS.md ----------

const TASK_RE = /^\s*- \[([ x~!-])\] \*\*(T-\d+[a-z]?)\*\*\s*(.*)$/;
const STATUS = { ' ': 'pendente', '~': 'andamento', x: 'feito', '!': 'bloqueado', '-': 'cancelado' };
export const REQ_ID_RE = /\b(?:RF|RN|RNF)-\d+\b/g;
const TASK_ID_RE = /\bT-\d+[a-z]?\b/g;

// Comentários HTML viram linhas vazias (mantém a numeração das linhas).
const stripComments = (text) => text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ''));

export function parseTasks(text = read(PATHS.tasks)) {
  const lines = stripComments(text).split(/\r?\n/);
  const tasks = [];
  let phase = '';
  let cur = null;
  lines.forEach((line, i) => {
    const heading = line.match(/^##\s+(.*)/);
    if (heading) { phase = heading[1].trim(); cur = null; return; }
    const m = line.match(TASK_RE);
    if (m) {
      const [, mark, id, rest] = m;
      const reqPart = rest.match(/req:\s*([^·]*)/i)?.[1] ?? '';
      const depPart = rest.match(/dep:\s*([^·]*)/i)?.[1] ?? '';
      cur = {
        id,
        status: STATUS[mark],
        title: rest.split(/\s+—\s+(?=req:|dep:)/i)[0].trim(),
        phase,
        line: i + 1,
        req: reqPart.match(REQ_ID_RE) ?? [],
        dep: depPart.match(TASK_ID_RE) ?? [],
        body: [line],
      };
      tasks.push(cur);
      return;
    }
    if (!cur) return;
    if (/^\s+\S/.test(line) || line.trim() === '') cur.body.push(line);
    else cur = null;
  });
  for (const t of tasks) {
    while (t.body.length && t.body[t.body.length - 1].trim() === '') t.body.pop();
    t.blocker = t.body.find((l) => /Bloqueio:/i.test(l))?.split(/Bloqueio:/i)[1]?.trim() ?? '';
  }
  return tasks;
}

export const planStatus = (text = read(PATHS.tasks)) =>
  text.match(/^Status do plano:\s*(\S+)/im)?.[1]?.toUpperCase() ?? 'VAZIO';

export const isOpen = (t) => t.status === 'pendente' || t.status === 'andamento';

export function nextTask(tasks) {
  const inProgress = tasks.find((t) => t.status === 'andamento');
  if (inProgress) return inProgress;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return tasks.find(
    (t) => t.status === 'pendente' && t.dep.every((d) => byId.get(d)?.status === 'feito'),
  ) ?? null;
}

export function counts(tasks) {
  const c = { total: tasks.length, pendente: 0, andamento: 0, feito: 0, bloqueado: 0, cancelado: 0 };
  for (const t of tasks) c[t.status]++;
  return c;
}

// ---------- REQUISITOS.md ----------

export function parseReqs(text = read(PATHS.reqs)) {
  const reqs = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\|\s*((?:RF|RN|RNF)-\d+)\s*\|\s*([^|]*)\|/);
    if (m) reqs.push({ id: m[1], text: m[2].trim() });
  }
  return reqs;
}

// ---------- Registro de IDs (detecta tarefas apagadas) ----------

export function syncRegistry(tasks) {
  const known = new Set(readJson(PATHS.registry, []));
  const current = new Set(tasks.map((t) => t.id));
  const missing = [...known].filter((id) => !current.has(id));
  const merged = [...new Set([...known, ...current])].sort();
  if (merged.length !== known.size) writeJson(PATHS.registry, merged);
  return missing;
}

// ---------- Validação do plano ----------

export function checkPlan() {
  const tasks = parseTasks();
  const reqs = parseReqs();
  const errors = [];
  const warnings = [];

  if (!tasks.length) errors.push('TASKS.md não tem tarefas. Rode /planejar.');

  const seen = new Set();
  for (const t of tasks) {
    if (seen.has(t.id)) errors.push(`ID duplicado: ${t.id} (linha ${t.line})`);
    seen.add(t.id);
  }

  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    for (const d of t.dep) if (!ids.has(d)) errors.push(`${t.id} depende de ${d}, que não existe`);
    if (!t.body.some((l) => /Crit[ée]rios:/i.test(l)) && t.status !== 'cancelado')
      errors.push(`${t.id} não tem "Critérios:"`);
    if (t.status === 'bloqueado' && !t.blocker) errors.push(`${t.id} está [!] sem "- Bloqueio: motivo"`);
    if (t.status === 'cancelado' && !t.body.some((l) => /DEC-\d+/.test(l)))
      errors.push(`${t.id} está [-] sem referência a uma decisão DEC-xxx aprovada pelo usuário`);
  }

  // Ciclos de dependência
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'visiting') { errors.push(`Ciclo de dependência: ${[...trail, id].join(' → ')}`); return; }
    state.set(id, 'visiting');
    for (const d of byId.get(id)?.dep ?? []) if (byId.has(d)) visit(d, [...trail, id]);
    state.set(id, 'done');
  };
  for (const t of tasks) visit(t.id, []);

  // Cobertura requisito ↔ tarefa
  const reqIds = new Set(reqs.map((r) => r.id));
  if (!reqs.length) errors.push('REQUISITOS.md não tem requisitos. Rode /planejar.');
  const covered = new Set(tasks.filter((t) => t.status !== 'cancelado').flatMap((t) => t.req));
  for (const r of reqs) if (!covered.has(r.id)) errors.push(`Requisito ${r.id} sem tarefa: ${r.text}`);
  for (const t of tasks)
    for (const r of t.req) if (!reqIds.has(r)) errors.push(`${t.id} cita ${r}, que não está em REQUISITOS.md`);
  for (const t of tasks)
    if (!t.req.length && !/fase 0/i.test(t.phase)) warnings.push(`${t.id} não cita requisito (req:)`);

  const missing = syncRegistry(tasks);
  for (const id of missing)
    errors.push(`Tarefa ${id} foi APAGADA do TASKS.md. Restaure-a (para cancelar use [-] com DEC-xxx).`);

  const status = planStatus();
  if (status !== 'APROVADO') warnings.push(`Status do plano: ${status} (precisa ser APROVADO para executar)`);

  return { errors, warnings, tasks, reqs };
}

// ---------- Estado / progresso ----------

const git = (cmd) => {
  try { return execSync(`git ${cmd}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return ''; }
};

// Muda sempre que há trabalho real: plano, diário, commits ou arquivos alterados.
export const progressHash = () =>
  crypto.createHash('sha1')
    .update(read(PATHS.tasks))
    .update(read(PATHS.progress))
    .update(git('rev-parse HEAD'))
    .update(git('status --porcelain'))
    .digest('hex');

export const autopilotOn = () => fs.existsSync(PATHS.autopilot);

export function setAutopilot(on) {
  if (on) {
    fs.mkdirSync(PATHS.state, { recursive: true });
    fs.writeFileSync(PATHS.autopilot, new Date().toISOString() + '\n');
  } else {
    fs.rmSync(PATHS.autopilot, { force: true });
  }
  fs.rmSync(PATHS.stopState, { force: true });
}

export const loadStopState = () => readJson(PATHS.stopState, { cycles: 0, noProgress: 0, lastHash: '' });
export const saveStopState = (s) => writeJson(PATHS.stopState, s);

export const taskLine = (t) => `${t.id} ${t.title}`;

// Últimas N entradas "### T-" do PROGRESSO.md (ignora o modelo antes do primeiro ---)
export function lastProgressEntries(n = 2) {
  const entries = read(PATHS.progress).split(/^---\s*$/m).slice(1).join('\n');
  const parts = entries.split(/^(?=### )/m).filter((s) => s.startsWith('### T-'));
  return parts.slice(-n).map((s) => s.trim()).join('\n\n');
}
