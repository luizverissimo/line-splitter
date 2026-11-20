// Stop: com o autopilot ligado, não deixa a IA parar enquanto houver tarefa executável.
// Saídas de segurança: tudo concluído, só restam bloqueadas, N ciclos sem progresso, limite de ciclos.
import {
  readStdinJson, loadConfig, parseTasks, counts, nextTask, isOpen, syncRegistry, autopilotOn, setAutopilot,
  loadStopState, saveStopState, progressHash, taskLine,
} from '../scripts/lib.mjs';
import { scanAll, formatHits } from '../scripts/anti-mock.mjs';

await readStdinJson();
if (!autopilotOn()) process.exit(0);

const cfg = loadConfig();
const noProgressLimit = cfg.noProgressLimit ?? 3;
const maxCycles = cfg.maxStopCycles ?? 300;

const emit = (obj) => { process.stdout.write(JSON.stringify(obj)); process.exit(0); };
const finish = (msg) => { setAutopilot(false); emit({ systemMessage: msg }); };

const tasks = parseTasks();
const c = counts(tasks);
const missing = syncRegistry(tasks);
const next = nextTask(tasks);
const blocked = tasks.filter((t) => t.status === 'bloqueado');
const blockedList = blocked.map((t) => `  - ${taskLine(t)} → ${t.blocker}`).join('\n');

// Proteção contra loop: conta ciclos e ciclos seguidos sem nenhuma mudança real.
const st = loadStopState();
const hash = progressHash();
st.noProgress = hash === st.lastHash ? st.noProgress + 1 : 0;
st.cycles += 1;
st.lastHash = hash;
saveStopState(st);

if (st.noProgress >= noProgressLimit) {
  finish(`Autopilot DESLIGADO: ${st.noProgress} tentativas seguidas de parar sem nenhum progresso (TASKS.md, PROGRESSO.md e git inalterados). ` +
    `Veja a última mensagem da IA — provavelmente ela precisa de uma decisão sua. Depois rode /autopilot de novo.`);
}
if (st.cycles > maxCycles) {
  finish(`Autopilot DESLIGADO: limite de ${maxCycles} ciclos atingido (maxStopCycles em .claude/guard.config.json). ${c.feito}/${c.total} feitas. Rode /autopilot para continuar.`);
}

const reasons = [];
if (missing.length) reasons.push(`Tarefas APAGADAS do docs/TASKS.md: ${missing.join(', ')}. Restaure-as (cancelar só com [-] + DEC-xxx aprovada pelo usuário).`);

if (next) {
  reasons.push(
    `Autopilot ligado: ${c.feito}/${c.total} feitas, ${c.pendente + c.andamento} ainda abertas. ` +
    `${next.status === 'andamento' ? 'Retome' : 'Próxima'}: ${taskLine(next)}. ` +
    'Siga .claude/commands/proxima.md (implementação real, testes, pnpm verify, revisor, commit). ' +
    'Não peça confirmação, não resuma, não pare. Se esta tarefa depende de algo externo que você não tem, marque [!] com "- Bloqueio:" e vá para a próxima.',
  );
  emit({ decision: 'block', reason: reasons.join('\n') });
}

if (tasks.some(isOpen)) {
  if (reasons.length) emit({ decision: 'block', reason: reasons.join('\n') });
  finish(`Autopilot DESLIGADO: as ${c.pendente} tarefas restantes dependem de tarefas bloqueadas.\nBloqueios que precisam de você:\n${blockedList}`);
}

// Nada aberto: última barreira — código de produção limpo?
const hits = scanAll();
if (hits.length) reasons.push(`Todas as tarefas estão fechadas, mas o scan anti-mock encontrou:\n${formatHits(hits)}\nCrie tarefas de correção no TASKS.md (fase "Correções da auditoria") e execute-as.`);
if (reasons.length) emit({ decision: 'block', reason: reasons.join('\n') });

finish(`Autopilot concluído: ${c.feito}/${c.total} tarefas feitas` +
  (blocked.length ? `, ${blocked.length} bloqueadas aguardando você:\n${blockedList}` : '.') +
  (c.cancelado ? `\n${c.cancelado} canceladas (ver docs/DECISOES.md).` : ''));
