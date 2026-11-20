---
description: Executa todas as tarefas do plano em sequência, até o fim
---

1. Rode `node .claude/scripts/tasks.mjs status`. Se o plano não estiver `APROVADO`, pare e avise o usuário.
2. Rode `node .claude/scripts/tasks.mjs autopilot on`.
3. Execute tarefa após tarefa seguindo **exatamente** `.claude/commands/proxima.md` (todos os passos, inclusive revisor e commit) até não sobrar tarefa pendente.

Enquanto o autopilot estiver ligado:
- Não peça confirmação entre tarefas, não pergunte "posso continuar?", não faça resumo geral no meio.
- Tarefa bloqueada por recurso externo: marque `[!]` com o motivo e siga para a próxima desbloqueada.
- Só pare quando todas as tarefas estiverem `[x]`/`[!]`/`[-]`, ou quando uma decisão do usuário bloquear **todas** as tarefas restantes.
- Um hook de Stop confere o `TASKS.md` toda vez que você tenta parar e te devolve ao trabalho se ainda houver tarefas. Ele desliga sozinho ao terminar, quando nada mais pode avançar, ou após 3 ciclos sem progresso. Nunca desligue o autopilot por conta própria.

Ao terminar, mostre `node .claude/scripts/tasks.mjs status`, a lista de bloqueios com o que o usuário precisa fornecer, e o resultado da auditoria final.
