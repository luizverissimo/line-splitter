# Fluxo PRD → produto completo com Claude Code

Kit para a IA construir o projeto inteiro a partir do PRD — web, desktop (Electron) e mobile (Capacitor) — sem mocks, sem cortar escopo e sem perder o fio entre sessões.

## Como usar

1. Copie esta pasta para a pasta do novo projeto e rode `git init`.
2. Cole o PRD completo em `docs/PRD.md`.
3. Abra o Claude Code na pasta e rode **`/planejar`**.
   A IA extrai cada requisito do PRD com ID, faz as perguntas que faltam (de uma vez só), gera o plano completo e valida a cobertura.
4. Revise `docs/TASKS.md` e `docs/REQUISITOS.md`. Peça ajustes à vontade. Quando estiver bom, diga **"aprovado"**.
5. Rode **`/autopilot`** (executa tudo até o fim) ou **`/proxima`** (uma tarefa por vez, com você acompanhando).
6. A qualquer momento: **`/status`**. Para interromper: **`/pausar`** (ou Esc). Para retomar: `/autopilot` de novo — ele continua de onde parou.

Para o autopilot rodar sem parar a cada comando, use o modo de permissão **Auto** (ou "aceitar edições") no Claude Code. O `.claude/settings.json` já libera `pnpm`, `npx`, `docker compose`, `git add/commit` e **bloqueia `git push`**.

## Por que a IA não esquece, não mocka e não para no meio

| Problema | O que impede |
|---|---|
| Esquece o que estava fazendo (sessão nova, contexto compactado) | O estado mora em arquivos (`TASKS.md`, `PROGRESSO.md`, `DECISOES.md`). O hook **SessionStart** injeta no início de toda sessão — e depois de toda compactação — o progresso, a tarefa em andamento e as últimas entradas do diário. |
| Esquece partes do PRD | `/planejar` transforma cada item do PRD em requisito com ID. `tasks.mjs check` falha se algum requisito não tem tarefa. A última tarefa (T-999) é sempre a auditoria `/auditar`, que procura evidência no código para **cada** requisito e cria tarefas para o que faltar. |
| Faz mock / dado fixo / botão que não faz nada | `CLAUDE.md` proíbe. O hook **PostToolUse** varre cada arquivo editado e devolve o erro na hora (mock, fake, TODO, "em breve", `@ts-ignore`, handler vazio…). O `pnpm verify` roda o mesmo scan. Arquivos de teste ficam de fora. |
| Diz "pronto" sem estar | Nenhuma tarefa vira `[x]` sem `pnpm verify` passando e sem o subagente **revisor** (cético, não edita nada) responder `APROVADO` com evidência `arquivo:linha` por critério. |
| "Isso fica para depois do MVP" | `CLAUDE.md` define MVP = tudo do PRD. Corte de escopo só com sua aprovação registrada em `DECISOES.md`. Tarefa apagada do plano é detectada (`.claude/task-ids.json`) e a IA é mandada restaurar. |
| Para no meio e pergunta "posso continuar?" | Com o autopilot ligado, o hook **Stop** confere o plano toda vez que a IA tenta parar e a manda de volta para a próxima tarefa. |
| Falta credencial / conta / Mac | A IA implementa a integração real lendo variáveis de ambiente, marca a tarefa `[!]` com o que você precisa fornecer e segue para a próxima. Nada é simulado. |

O autopilot desliga sozinho quando: tudo foi concluído; só restam tarefas que dependem de bloqueios seus; houve 3 tentativas seguidas de parar sem nenhum progresso (sinal de que a IA precisa de você); ou bateu o limite de 300 ciclos. Os limites ficam em `.claude/guard.config.json`.

## Arquivos

```
CLAUDE.md                     regras permanentes (carregado em toda sessão)
docs/PRD.md                   seu PRD (editar pede sua aprovação)
docs/REQUISITOS.md            requisitos com ID ↔ tarefas
docs/TASKS.md                 plano completo com status
docs/PROGRESSO.md             diário por tarefa
docs/DECISOES.md              decisões e mudanças de escopo aprovadas
.claude/commands/             /planejar /proxima /autopilot /pausar /status /auditar
.claude/agents/revisor.md     revisor independente
.claude/hooks/                session-context, pre-edit-guard, post-edit-guard, stop-guard
.claude/scripts/tasks.mjs     status | next | show T-xxx | check | autopilot on|off
.claude/scripts/anti-mock.mjs scan de código de produção (também usado no pnpm verify)
.claude/guard.config.json     padrões proibidos, pastas varridas, limites do autopilot
.claude/task-ids.json         registro de IDs (gerado; versione no git)
```

## Ajustes comuns

- **Outra stack**: edite a seção "Stack" do `CLAUDE.md` (ou deixe o PRD dizer — ele prevalece).
- **Falso positivo no scan**: comente na linha `// guard-allow: motivo`, ou ajuste `forbidden` em `.claude/guard.config.json`.
- **Código fora de `apps/` e `packages/`**: adicione a pasta em `scanDirs`.
- **iOS**: o Capacitor só gera build iOS no macOS. No Windows essas tarefas ficarão `[!]` até você ter um Mac (ou CI com macOS).

## Limites honestos

Os hooks e o revisor reduzem muito, mas não zeram, a chance de a IA errar — por isso a auditoria final existe e cria tarefas de correção em vez de aceitar falhas. Um PRD grande no autopilot consome bastante uso; `/proxima` dá mais controle se você quiser acompanhar tarefa a tarefa.
