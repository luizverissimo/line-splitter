---
description: Audita se TUDO do PRD está implementado de verdade e cria tarefas para o que faltar
---

Auditoria cética de cobertura. Não confie nos `[x]`: procure evidência.

1. `node .claude/scripts/tasks.mjs check` — cobertura requisito ↔ tarefa.
2. `node .claude/scripts/anti-mock.mjs` — nada simulado no código de produção.
3. Para **cada** requisito de `docs/REQUISITOS.md`, ache a evidência: arquivo:linha da rota/regra/tela que o implementa e o teste que o cobre. Com muitos requisitos, divida em grupos e use subagentes `revisor` em paralelo (um por grupo), pedindo evidência por requisito.
4. Rode `pnpm verify`, a suíte E2E completa e os builds de todas as plataformas.
5. Escreva `docs/AUDITORIA.md`: tabela `Requisito | Evidência (arquivo:linha) | Teste | OK/FALHA | Observação`, mais o resultado dos comandos.
6. Para cada FALHA crie tarefa nova no `TASKS.md`, numa fase "Correções da auditoria" antes da T-999, com ID novo e `req:` do requisito. Nunca justifique uma falha como aceitável.
7. Se esta auditoria é a T-999 e houve falhas, deixe a T-999 `[ ]` com `dep:` nas tarefas de correção — ela roda de novo depois delas. Só marque `[x]` com 100% OK (ou bloqueios `[!]` reais documentados).
