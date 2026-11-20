// SessionStart (startup/resume/clear/compact): injeta no contexto onde o projeto está.
// É o que faz a IA "lembrar" depois de fechar a sessão ou compactar a conversa.
import {
  readStdinJson, parseTasks, planStatus, counts, nextTask, autopilotOn, taskLine, lastProgressEntries, isOpen,
} from '../scripts/lib.mjs';

const input = await readStdinJson();
const tasks = parseTasks();
const out = ['[Estado do projeto — gerado automaticamente por .claude/hooks/session-context.mjs]'];

if (!tasks.length) {
  out.push('Ainda não há plano. Fluxo: PRD em docs/PRD.md → /planejar → usuário aprova → /autopilot ou /proxima.');
} else {
  const c = counts(tasks);
  out.push(`Plano: ${planStatus()} · ${c.feito}/${c.total} feitas · ${c.andamento} em andamento · ${c.pendente} pendentes · ${c.bloqueado} bloqueadas`);
  out.push(`Autopilot: ${autopilotOn() ? 'LIGADO — continue executando tarefas seguindo .claude/commands/proxima.md, sem pedir confirmação.' : 'desligado'}`);
  const next = nextTask(tasks);
  if (next) {
    out.push(`${next.status === 'andamento' ? 'EM ANDAMENTO (retome esta antes de qualquer outra)' : 'Próxima'}: ${taskLine(next)} (fase: ${next.phase})`);
  } else if (tasks.some(isOpen)) {
    out.push('Nenhuma tarefa executável: as pendentes dependem de tarefas bloqueadas.');
  } else {
    out.push('Todas as tarefas concluídas.');
  }
  for (const t of tasks.filter((x) => x.status === 'bloqueado')) out.push(`Bloqueada: ${taskLine(t)} → ${t.blocker}`);
  const recent = lastProgressEntries(2);
  if (recent) out.push('', 'Últimas entradas de docs/PROGRESSO.md:', recent);
}

if (input.source === 'compact') {
  out.push('', 'O contexto foi COMPACTADO. Antes de continuar, releia a tarefa atual com `node .claude/scripts/tasks.mjs next` e confira o estado real do código (git status/diff). Não confie no resumo.');
}
out.push('', 'Regras: CLAUDE.md. Sem mock/fake/dado fixo, sem reduzir escopo, nada vira [x] sem verify + revisor APROVADO.');

process.stdout.write(out.join('\n') + '\n');
