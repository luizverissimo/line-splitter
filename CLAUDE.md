# Regras do projeto (valem para toda sessão, inclusive depois de compactar o contexto)

Este projeto é construído por IA a partir de `docs/PRD.md`, seguindo `docs/TASKS.md` **até a última tarefa**.
Não confie na memória da conversa. Confie nos arquivos abaixo — eles são a memória do projeto.

## Fonte da verdade

| Arquivo | Para quê |
|---|---|
| `docs/PRD.md` | O que construir. Nunca edite sem pedido explícito do usuário. |
| `docs/REQUISITOS.md` | Cada item do PRD com ID (RF/RN/RNF) e as tarefas que o cobrem. |
| `docs/TASKS.md` | Plano completo, do setup à entrega. Status de cada tarefa. |
| `docs/PROGRESSO.md` | Diário: o que foi feito, como foi verificado, commit. |
| `docs/DECISOES.md` | Decisões técnicas e qualquer mudança de escopo **aprovada pelo usuário**. |

Antes de qualquer trabalho: rode `node .claude/scripts/tasks.mjs status` e leia as últimas entradas de `docs/PROGRESSO.md`.

## Proibido

- Mock, fake, stub, dados fixos no código de produção, "lorem ipsum", `setTimeout` simulando API, botão que não faz nada, tela "em breve", `TODO`/`FIXME` deixado para trás, `throw new Error('not implemented')`.
- Reduzir escopo por conta própria. **"MVP" aqui = tudo que está no PRD.** Não existe "numa versão futura", "para simplificar", "por enquanto", "fora do escopo do MVP" — a não ser que o usuário aprove e isso esteja registrado em `docs/DECISOES.md`.
- Marcar tarefa `[x]` sem rodar a verificação e sem o subagente `revisor` aprovar.
- Apagar tarefas do `TASKS.md`, pular tarefas ou mudar a ordem das fases. Pode **adicionar** tarefas (sub-tarefas descobertas), sempre com ID novo. Cancelar (`[-]`) só com aprovação do usuário registrada em `DECISOES.md`.
- Desativar ou enfraquecer testes, `@ts-ignore`, `eslint-disable`, `any` para "fazer passar".
- Dizer "pronto" com base no que o código "deveria" fazer. Pronto = executado e verificado.

## Quando falta algo real (credencial, API de terceiro, conta de loja, Mac para iOS)

Implemente a integração **real e completa**, lendo a configuração de variáveis de ambiente documentadas em `.env.example`, com erro claro quando a variável falta. **Não simule.**
Se não dá para verificar sem o recurso, marque a tarefa `[!]`, escreva no corpo dela `- Bloqueio: <o que falta e o que o usuário precisa fornecer>`, registre em `PROGRESSO.md` e siga para a próxima tarefa desbloqueada.

## Definição de pronto (toda tarefa)

1. Todos os critérios de aceite da tarefa atendidos de ponta a ponta (banco real → API → UI, quando aplicável).
2. UI com estados de carregando, vazio e erro; validação de entrada no cliente **e** no servidor.
3. Testes para o comportamento novo. Testes de integração usam o banco real (docker), não mocks. Mock só para serviço de terceiro pago/externo, e só dentro de arquivos de teste.
4. `pnpm verify` passa (typecheck, lint, testes, scan anti-mock).
5. Subagente `revisor` respondeu `APROVADO`.
6. `TASKS.md` atualizado, entrada em `PROGRESSO.md`, commit local `T-xxx: título`. Nunca `git push` sem pedido.

## Stack (padrão — o PRD prevalece se disser outra coisa)

- Monorepo **pnpm workspaces**, TypeScript `strict` em tudo.
- `apps/api` — Node + Fastify + Prisma + PostgreSQL (docker compose). Validação com Zod.
- `apps/web` — React + Vite + React Router + TanStack Query. **A mesma UI** serve web, desktop e mobile.
- `apps/desktop` — Electron carregando o build do `web` (preload seguro, `contextIsolation: true`, sem `nodeIntegration`).
- `apps/mobile` — Capacitor empacotando o build do `web` (Android no Windows; iOS exige macOS).
- `packages/shared` — schemas Zod e tipos compartilhados entre API e web.
- Testes: Vitest (unidade/integração) e Playwright (E2E na web).
- A URL da API vem de `VITE_API_URL` (nunca fixa). Autenticação precisa funcionar nas 3 plataformas — cookie cross-origin falha em Electron/Capacitor; prefira token Bearer com armazenamento seguro, ou registre a escolha em `DECISOES.md`.

## Ritmo de trabalho

- Uma tarefa por vez: `[~]` ao começar, `[x]` só ao cumprir a definição de pronto.
- Fatias verticais: cada funcionalidade vai do banco à tela na mesma tarefa.
- Tarefa grande demais? Quebre em sub-tarefas (`T-012a`, `T-012b`) no `TASKS.md` antes de começar.
- Relatórios ao usuário: curtos, em português, dizendo o que foi verificado e como.

## Comandos do fluxo

`/planejar` (PRD → requisitos + tarefas) · `/proxima` (executa 1 tarefa) · `/autopilot` (executa tudo) · `/pausar` · `/status` · `/auditar`
