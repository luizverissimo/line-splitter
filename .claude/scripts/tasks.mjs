#!/usr/bin/env node
// CLI do plano.
//   node .claude/scripts/tasks.mjs status          resumo por fase, atual, próxima, bloqueios
//   node .claude/scripts/tasks.mjs next            mostra a próxima tarefa a executar
//   node .claude/scripts/tasks.mjs show T-012      mostra uma tarefa
//   node .claude/scripts/tasks.mjs check           valida formato, dependências e cobertura do PRD
//   node .claude/scripts/tasks.mjs autopilot on|off
import {
  parseTasks, planStatus, nextTask, counts, checkPlan, setAutopilot, autopilotOn, taskLine, isOpen,
} from './lib.mjs';

const [cmd = 'status', arg] = process.argv.slice(2);
const print = (s = '') => process.stdout.write(s + '\n');

function status() {
  const tasks = parseTasks();
  const c = counts(tasks);
  print(`Plano: ${planStatus()} · Autopilot: ${autopilotOn() ? 'LIGADO' : 'desligado'}`);
  if (!tasks.length) { print('Nenhuma tarefa. Coloque o PRD em docs/PRD.md e rode /planejar.'); return; }
  print(`Tarefas: ${c.feito}/${c.total} feitas · ${c.andamento} em andamento · ${c.pendente} pendentes · ${c.bloqueado} bloqueadas · ${c.cancelado} canceladas`);
  print();
  const phases = [...new Set(tasks.map((t) => t.phase))];
  for (const ph of phases) {
    const pc = counts(tasks.filter((t) => t.phase === ph));
    const done = pc.feito + pc.cancelado;
    print(`  ${done === pc.total ? '✔' : ' '} ${ph}: ${pc.feito}/${pc.total}${pc.bloqueado ? ` (${pc.bloqueado} bloqueadas)` : ''}`);
  }
  print();
  const next = nextTask(tasks);
  if (next) print(`${next.status === 'andamento' ? 'Em andamento' : 'Próxima'}: ${taskLine(next)}`);
  else if (tasks.some(isOpen)) print('Nenhuma tarefa executável: as pendentes dependem de tarefas bloqueadas.');
  else print('Todas as tarefas concluídas.');
  const blocked = tasks.filter((t) => t.status === 'bloqueado');
  if (blocked.length) {
    print('Bloqueadas:');
    for (const t of blocked) print(`  - ${taskLine(t)} → ${t.blocker}`);
  }
}

function show(t) {
  if (!t) { print('Tarefa não encontrada.'); process.exitCode = 1; return; }
  print(`[${t.phase}] (${t.status}) linha ${t.line} de docs/TASKS.md`);
  print(t.body.join('\n'));
}

switch (cmd) {
  case 'status':
    status();
    break;
  case 'next': {
    if (planStatus() !== 'APROVADO') print(`ATENÇÃO: Status do plano é ${planStatus()}, não APROVADO.`);
    const tasks = parseTasks();
    const t = nextTask(tasks);
    if (t) show(t);
    else print(tasks.some(isOpen) ? 'Nenhuma tarefa executável: as pendentes dependem de bloqueadas.' : 'Todas as tarefas concluídas.');
    break;
  }
  case 'show':
    show(parseTasks().find((t) => t.id === arg));
    break;
  case 'check': {
    const { errors, warnings, tasks, reqs } = checkPlan();
    print(`${reqs.length} requisitos · ${tasks.length} tarefas`);
    for (const w of warnings) print(`aviso: ${w}`);
    for (const e of errors) print(`ERRO: ${e}`);
    print(errors.length ? `\n${errors.length} erro(s).` : 'OK: plano consistente e todos os requisitos cobertos.');
    process.exitCode = errors.length ? 1 : 0;
    break;
  }
  case 'autopilot':
    if (arg !== 'on' && arg !== 'off') { print('Uso: autopilot on|off'); process.exitCode = 1; break; }
    setAutopilot(arg === 'on');
    print(`Autopilot ${arg === 'on' ? 'LIGADO' : 'desligado'}.`);
    break;
  default:
    print('Comandos: status | next | show T-xxx | check | autopilot on|off');
    process.exitCode = 1;
}
