---
description: Lê o PRD e gera REQUISITOS.md + TASKS.md completos, do setup à entrega
---

Transforme `docs/PRD.md` em um plano executável **completo**. Não implemente nada neste comando.

## 1. Ler
Leia `docs/PRD.md` inteiro, `CLAUDE.md` e `docs/DECISOES.md`. Se o PRD estiver vazio, pare e peça ao usuário para colá-lo.

## 2. Extrair requisitos → `docs/REQUISITOS.md`
Uma linha por item, com ID único:
- `RF-xx` cada funcionalidade, tela, fluxo, perfil de usuário, relatório, notificação, integração;
- `RN-xx` cada regra de negócio, cálculo, permissão, limite, validação;
- `RNF-xx` plataformas (web, desktop, Android, iOS), segurança, desempenho, offline, acessibilidade, idioma.

Regra: **se o PRD menciona, vira requisito.** Na coluna "Origem no PRD" cite a seção/frase curta. Releia o PRD do começo ao fim uma segunda vez procurando o que ficou de fora.

## 3. Lacunas
Liste ambiguidades e lacunas. As que mudam o plano, pergunte ao usuário **num lote só** (AskUserQuestion). As pequenas, decida o padrão sensato e registre em `docs/DECISOES.md`. Nunca resolva uma lacuna cortando funcionalidade.

## 4. Gerar `docs/TASKS.md`
Mantenha o cabeçalho e o comentário de formato. Troque `Status do plano:` para `RASCUNHO`. Fases, nesta ordem:

**Fase 0 — Fundação** (sempre, adaptada ao PRD):
- Monorepo pnpm + TS strict + ESLint + Prettier + script `pnpm verify` = typecheck + lint + testes + `node .claude/scripts/anti-mock.mjs`
- Docker compose (PostgreSQL) + Prisma + primeira migração + `.env.example`
- API Fastify: health, config validada com Zod, erro padronizado, log, teste de integração contra o banco real
- Web React + Vite: rotas, layout base, cliente HTTP (TanStack Query) usando `VITE_API_URL`, tratamento global de erro
- Desktop Electron rodando o web (dev e build)
- Mobile Capacitor Android rodando o web (APK debug gerado)
- Playwright com um E2E real (web → API → banco)

**Fase 1 — Núcleo**: autenticação/perfis/permissões (se o PRD tiver), modelo de dados principal, navegação, componentes base de UI.

**Fases 2..N — Funcionalidades**: fatias verticais (banco + API + UI + testes na mesma tarefa), agrupadas por área do PRD, em ordem de dependência.

**Fase — Recursos de plataforma**: o que o PRD pede de específico para desktop/mobile (notificações, câmera, offline, deep link, auto-update, ícones, splash…).

**Fase — Qualidade**: E2E cobrindo **todos** os fluxos do PRD, revisão de segurança (authz em toda rota, validação, segredos), desempenho, acessibilidade.

**Fase final — Entrega**: builds de produção (web, instalador Electron, AAB/APK; iOS se houver Mac), README de execução e deploy, e por último sempre:
`- [ ] **T-999** Auditoria final de cobertura do PRD (/auditar) — req: todos os requisitos · dep: <todas as tarefas anteriores>`
(liste os IDs de requisito reais em `req:`).

Formato de cada tarefa (obrigatório):
```
- [ ] **T-012** Cadastro de produtos (API + tela de lista/criação/edição) — req: RF-03, RN-02 · dep: T-010
  - Critérios:
    - POST/PUT/DELETE /products persistem no PostgreSQL e validam com o schema de packages/shared
    - Tela lista produtos reais da API, com estados carregando/vazio/erro e paginação
    - Usuário sem permissão recebe 403 e a UI esconde as ações
    - Testes de integração da API contra o banco e teste de componente da tela
  - Verificar: `pnpm verify` e `pnpm --filter web test:e2e -- produtos`
```
Tamanho: cada tarefa cabe numa sessão focada; 3–8 critérios **verificáveis** (nada de "funciona bem"). IDs `T-001`, `T-002`… em sequência, com folga entre fases se quiser (ex.: Fase 2 começa em T-100).

## 5. Matriz de cobertura
Preencha a coluna "Tarefas" de `REQUISITOS.md` (Status = `pendente`). Todo requisito tem ao menos uma tarefa; toda tarefa fora da Fase 0 cita ao menos um requisito.

## 6. Validar
Rode `node .claude/scripts/tasks.mjs check` e corrija até não haver erros.

## 7. Apresentar
Mostre ao usuário: nº de requisitos, nº de tarefas por fase, decisões tomadas e perguntas pendentes. Peça para revisar `docs/TASKS.md`. Quando o usuário aprovar, troque para `Status do plano: APROVADO` e sugira `/autopilot` ou `/proxima`.
