#!/usr/bin/env node
// Procura simulação, pendências e atalhos no código de produção (arquivos de teste ficam de fora).
//   node .claude/scripts/anti-mock.mjs            varre scanDirs de .claude/guard.config.json
//   node .claude/scripts/anti-mock.mjs a.ts b.tsx varre só esses arquivos
// Exceção legítima: comente na mesma linha `// guard-allow: motivo`.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadConfig } from './lib.mjs';

const cfg = loadConfig();
const rules = (cfg.forbidden ?? []).map((r) => ({ re: new RegExp(r.pattern, r.flags ?? ''), why: r.why }));
const testRes = (cfg.testPathPatterns ?? []).map((s) => new RegExp(s));
const ignoreDirs = new Set(cfg.ignoreDirs ?? []);
const exts = new Set(cfg.extensions ?? []);
const allowMarker = cfg.allowMarker ?? 'guard-allow:';

const rel = (file) => path.relative(ROOT, path.resolve(ROOT, file)).split(path.sep).join('/');

export function inScope(file) {
  const r = rel(file);
  if (r.startsWith('..')) return false;
  const segs = r.split('/');
  if (!(cfg.scanDirs ?? []).includes(segs[0])) return false;
  if (segs.some((s) => ignoreDirs.has(s))) return false;
  if (!exts.has(path.extname(r))) return false;
  return !testRes.some((re) => re.test('/' + r));
}

export function scanFile(file) {
  let text;
  try { text = fs.readFileSync(path.resolve(ROOT, file), 'utf8'); } catch { return []; }
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (line.includes(allowMarker)) return;
    for (const { re, why } of rules) {
      const m = line.match(re);
      if (m) { hits.push({ file: rel(file), line: i + 1, match: m[0], why, text: line.trim().slice(0, 160) }); break; }
    }
  });
  return hits;
}

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!ignoreDirs.has(e.name) && !e.name.startsWith('.')) walk(full, out); }
    else if (inScope(full)) out.push(full);
  }
}

export function scanAll() {
  const files = [];
  for (const d of cfg.scanDirs ?? []) walk(path.join(ROOT, d), files);
  return files.flatMap(scanFile);
}

export const formatHits = (hits, max = 40) =>
  hits.slice(0, max).map((h) => `${h.file}:${h.line} [${h.why}] "${h.match}" → ${h.text}`).join('\n') +
  (hits.length > max ? `\n… e mais ${hits.length - max}` : '');

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const hits = args.length ? args.filter(inScope).flatMap(scanFile) : scanAll();
  if (hits.length) {
    console.log(`anti-mock: ${hits.length} ocorrência(s) no código de produção:\n${formatHits(hits, 200)}`);
    console.log('\nImplemente de verdade. Exceção legítima? Comente na linha: // guard-allow: motivo');
    process.exitCode = 1;
  } else {
    console.log('anti-mock: OK');
  }
}
