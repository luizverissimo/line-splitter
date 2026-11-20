---
description: Executa a próxima tarefa do TASKS.md até cumprir a definição de pronto
argument-hint: "[T-xxx opcional]"
---

Execute **uma** tarefa inteira, sem atalhos. Tarefa pedida: $ARGUMENTS (vazio = a próxima do plano).

1. **Escolher.** Rode `node .claude/scripts/tasks.mjs next` (ou `show $ARGUMENTS`). Se o plano não estiver `APROVADO`, pare e avise. Tarefa `[~]` existente sempre tem prioridade: retome-a.
2. **Entender.** Leia a tarefa, os requisitos citados em `docs/REQUISITOS.md`, os trechos correspondentes do `docs/PRD.md`, decisões relacionadas em `docs/DECISOES.md` e o código existente que ela toca.
3. **Marcar `[~]`** no `TASKS.md`. Se a tarefa for grande demais, quebre em sub-tarefas (`T-012a`, `T-012b`, com mesmos `req:`) e comece pela primeira.
4. **Implementar de verdade**, do banco à tela: migração, schema compartilhado, rota, regra, UI com carregando/vazio/erro, validação nos dois lados, permissões. Nada simulado, nada adiado. Se faltar um recurso externo, siga a seção "Quando falta algo real" do `CLAUDE.md`.
5. **Testar.** Escreva os testes do comportamento novo (integração contra o banco real). Rode `pnpm verify` e os comandos do campo `Verificar:`. Corrija o código até passar — nunca enfraqueça o teste.
6. **Ver funcionando.** Se há UI, suba API + web e percorra o fluxo no navegador (ou um E2E Playwright). Se a tarefa é de plataforma, rode no Electron/Android.
7. **Revisão independente.** Chame o subagente `revisor` passando o ID da tarefa. Se vier `REPROVADO`, corrija tudo que ele apontou e chame de novo. Só siga com `APROVADO`.
8. **Fechar.**
   - Marque `[x]` no `TASKS.md`.
   - Em `REQUISITOS.md`, marque o requisito como `feito` quando todas as tarefas dele estiverem `[x]`.
   - Adicione a entrada no fim de `docs/PROGRESSO.md` (modelo no topo do arquivo).
   - `git add -A && git commit -m "T-xxx: título"` (sem push).
   - Tarefa nova descoberta no caminho? Adicione ao `TASKS.md` com ID novo, na fase certa.
9. **Relatar** em 3–5 linhas: o que foi feito, como foi verificado, próxima tarefa.
