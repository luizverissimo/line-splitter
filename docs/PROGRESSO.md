# Diário de progresso

Uma entrada por tarefa concluída ou bloqueada, a mais recente no fim. Modelo:

```
### T-xxx — título (AAAA-MM-DD)
- Feito: o que foi implementado (arquivos principais)
- Verificado: comandos rodados e resultado; fluxo testado na UI
- Revisor: APROVADO
- Commit: <hash curto>
- Observações: descobertas, sub-tarefas criadas, bloqueios
```

---

### T-001 — Monorepo pnpm + TS strict + ESLint + Prettier + Vitest + `pnpm verify` (2026-11-20)
- Feito: `package.json` raiz (typecheck/lint/format/test/antimock/verify), `pnpm-workspace.yaml`, `tsconfig.base.json` (strict + noUncheckedIndexedAccess), `tsconfig.json` raiz checando os configs, `eslint.config.js` (typescript-eslint strict + `@vitest/eslint-plugin` com no-focused-tests/no-disabled-tests), Prettier, `vitest.config.ts` com projects e `--allowOnly=false`; `packages/shared` com `formatDuration`/`formatBytes` e testes.
- Verificado: `pnpm verify` passou (6 testes, anti-mock OK). Injeções de falha (erro de tipo, lint, .only, .skip, xit, prettier, lorem ipsum, erro em vitest.config.ts) fazem `pnpm verify` sair ≠ 0.
- Revisor: REPROVADO (faltava barrar .only/.skip, typecheck dos configs, vírgula em formatBytes) → corrigido → APROVADO
- Commit: ver `git log` (T-001)

### T-002 — `packages/shared`: schemas Zod e contrato IPC tipado (2026-11-20)
- Feito: `packages/shared/src/ipc/` — `errors.ts` (AppError, códigos, `describeZodError`), `ipc.ts` (`createIpc` com `defineHandler`/`invoke`/`encodeEvent`/`decodeEvent`, envelope `{ ok, data|error }`), `contract.ts` (contrato de produção com `app:info`); `zod-locale.ts` com mensagens do Zod em português.
- Verificado: `pnpm verify` OK (21 testes); testes cobrem válido, inválido (sem envio), resposta fora do schema, AppError preservado, erro inesperado → INTERNAL, eventos.
- Revisor: APROVADO. Sugestões aplicadas: `encodeEvent` lança AppError; ZodError interno do handler vira INTERNAL.
- Observações: o locale do Zod é pt-PT; schemas exibidos ao usuário terão mensagens próprias em pt-BR nas tarefas de UI (T-010, T-200, T-201).
- Commit: ver `git log` (T-002)

### T-003 — `apps/web`: React + Vite, rotas, layout base escuro, TanStack Query sobre IPC (2026-11-20)
- Feito: `apps/web` (Vite, React 19, React Router 7 com HashRouter, TanStack Query). `api/bridge.ts` + `api/client.ts` chamam `window.api` via `ipc.invoke` do shared; `DesktopBridge` em `packages/shared/src/ipc/bridge.ts`. Layout com navegação lateral, tema escuro, rodapé com `app:info`. ErrorBoundary global + por página (reset ao trocar de rota, "Voltar ao início"), `QueryError`.
- Verificado: `pnpm verify` OK (34 testes); `pnpm --filter @line-splitter/web build` OK. Testes cobrem navegação, carregando/erro/nova tentativa no rodapé, resposta fora do contrato, 404, boundaries global e de página.
- Revisor: REPROVADO (boundary sem saída, sem teste de integração) → corrigido → APROVADO. Sugestões finais aplicadas.
- Observações: `createMemoryRouter` (data router) quebra no jsdom com AbortSignal do undici; usado roteador declarativo (`HashRouter` + `useRoutes`).
- Commit: ver `git log` (T-003)

### T-004 — `apps/desktop`: Electron seguro carregando o web (dev e build) (2026-11-20)
- Feito: `apps/desktop` (Electron 45, esbuild para main/preload). `webPreferences` com contextIsolation/sandbox/sem nodeIntegration; preload expõe só `window.api` (canais/eventos do contrato). Protocolo `app://bundle` serve o build do web com CSP restritiva e proteção a path traversal; CSP de dev via header para o Vite. Navegação/novas janelas/webview/permissões bloqueadas; IPC recusa remetente fora da origem. Instância única. `LINE_SPLITTER_USER_DATA` e `LINE_SPLITTER_DEV_URL` validados (`.env.example`). `pnpm dev` (Vite + Electron) e `pnpm --filter @line-splitter/desktop start`.
- Verificado: `pnpm verify` OK (47 testes, incl. env/security/static-files). Playwright `_electron` manual: rodapé com `app:info` em produção e dev, prefs seguras em execução, canal fora do contrato recusado, CSP no header, segunda instância sai, env inválida mostra erro. Testes acharam bug real: `URL.origin` é "null" para app:/file: no Node → comparação trocada por protocolo+host.
- Revisor: APROVADO. `openExternalSafe` não usado foi removido; critérios de teste de origem do IPC (T-602) e `extraResources` (T-900) acrescentados.
- Observações: Electron rodado com `--no-sandbox` nesta máquina (AppArmor; sem sudo) — DEC-008 pendente de aprovação do usuário.
- Commit: ver `git log` (T-004)

### T-005 — Banco SQLite local (`better-sqlite3`) com migrações (2026-11-20)
- Feito: `apps/desktop/src/main/db/` — `migrations.ts` (v1: `settings`, `separations` com CHECKs de instrumento/dispositivo/bitrate, STRICT) e `database.ts` (`migrate` com `PRAGMA user_version`, uma transação por migração, recusa banco mais novo; `openDatabase` com WAL). Banco aberto no `app.whenReady` em `userData/line-splitter.db`, fechado no `will-quit`, erro fatal claro se falhar.
- Verificado: `pnpm verify` OK (53 testes); `pnpm --filter @line-splitter/desktop test db` (6 testes: do zero, idempotente com dados preservados, leitura/escrita, CHECKs, versão mais nova, rollback). App em execução com `LINE_SPLITTER_USER_DATA` temporário criou o banco com `user_version=1`.
- Revisor: REPROVADO (Prettier; premissa errada da DEC-009 — o prebuild N-API do better-sqlite3 13 roda nos dois runtimes) → testes voltaram ao Node do sistema, `electron-rebuild` removido, DEC-009 e critério corrigidos → APROVADO.
- Observações: T-006 dividida em T-006a (infra E2E) e T-006b (preferência pela UI, depende da T-010).
- Commit: ver `git log` (T-005)

### T-006a — Infraestrutura Playwright `_electron` + E2E UI → IPC → main → SQLite (2026-11-20)
- Feito: `playwright.config.ts` (forbidOnly, trace/screenshot em falha), `e2e/app.ts` (abre o build de produção com `LINE_SPLITTER_USER_DATA` temporário por teste, fixture que limpa a pasta), `e2e/db.ts` (lê o banco com `node:sqlite`), `e2e/fundacao.spec.ts`; script `pnpm test:e2e`.
- Verificado: `pnpm verify` OK; `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e` → 2 passed (rodapé com dados do IPC real; banco criado/migrado; reinício preserva dados sem reaplicar migrações). Teste proposital com falha salvou screenshot e trace.
- Revisor: APROVADO. Sugestões aplicadas: plataforma/versão do Electron sem valor fixo, try/finally no primeiro launch, `engines.node >=22.5`, convenção de nomes dos E2E (DEC-010).
- Observações: os E2E só rodam nesta máquina com `LINE_SPLITTER_DEV_NO_SANDBOX=1` (Electron com --no-sandbox) — DEC-008 pendente de aprovação do usuário.
- Commit: ver `git log` (T-006a)

### T-007 — Fixtures de áudio gerados com FFmpeg real e helpers de teste (2026-11-20)
- Feito: `scripts/fixtures.mjs` (clipe sintético de 8 s — baixo, melodia, bumbo, chimbal — em WAV/MP3/FLAC/M4A/OGG; corrompido; MP3 salvo como `.wma`; texto salvo como `.wav`; arquivo esparso de 501 MB; WAV de 31 min com `--long`; escrita atômica), `apps/desktop/src/test/audio.ts` (`probe` com ffprobe real), `global-setup.ts` no Vitest do desktop, `pnpm fixtures`. `/fixtures/` git-ignorado.
- Verificado: `pnpm verify` OK (62 testes, 9 de fixtures: codec, 44,1 kHz, estéreo, ~8 s, bitrate, inválidos rejeitados, limites). Apagando `fixtures/`, o globalSetup recria tudo. Pico do clipe −1,9 dB (sem clipping).
- Revisor: APROVADO. Sugestões aplicadas: `/fixtures/` só na raiz, ganho/limiter sem normalização, escrita atômica.
- Commit: ver `git log` (T-007)

### T-011 — Componentes base de UI e protocolo seguro de mídia (2026-11-20)
- Feito: `apps/web/src/components/ui/` — Button (loading/aria-busy), SelectableCard (radio nativo), ProgressBar (determinado/indeterminado), ConfirmDialog (`<dialog>` nativo, useId), ErrorAlert, EmptyState, Spinner/LoadingState, AudioPlayer (play/pause, posição arrastável, tempo, volume/silenciar, erro). `apps/desktop/src/main/media/` — `MediaRegistry` (URL opaca `media://audio/<token>` por arquivo liberado) e `serveMedia` (403/404/405, Range 206/416); esquema registrado com `stream: true` e handler no main.
- Verificado: `pnpm verify` OK (90 testes; protocolo testado com WAV real: bytes RIFF, Range "WAVE"); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e` 3 passed (no Electron real: handler `media` registrado e `<audio>` com erro 4 para mídia não liberada).
- Revisor: REPROVADO (typecheck do E2E sem lib DOM; asserção fraca; id fixo; UX do volume/arrasto) → corrigido → APROVADO.
- Observações: tocar faixa liberada no Electron real virou critério da T-304 (as telas que liberam arquivos vêm nas T-201/T-304).
- Commit: ver `git log` (T-011)

### T-010 — Configurações persistidas (IPC + tela) (2026-11-20)
- Feito: `packages/shared/src/settings.ts` (schema com mensagens pt-BR, caminhos absolutos Linux/Windows); canais `settings:get`, `settings:update`, `dialog:chooseDirectory`, `dialog:chooseFile`; `apps/desktop/src/main/settings/` (repositório SQLite com padrões do PRD, validação de pasta gravável/criável e executáveis no disco); tela Configurações (pasta e executáveis por diálogo nativo, bitrate, dispositivo, detecção automática, validação no cliente, formulário bloqueado durante o envio, envia só o que mudou, carregando/erro/confirmação).
- Verificado: `pnpm verify` OK (113 testes; 10 de integração com SQLite real, 9 de componente); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e configuracoes` 2 passed (padrões, diálogo, gravação no banco, Python inválido recusado pelo main); tela conferida por screenshot.
- Revisor: REPROVADO (formulário editável durante o salvamento) → corrigido → APROVADO.
- Observações: E2E depende de `LINE_SPLITTER_DEV_NO_SANDBOX=1` (DEC-008 pendente).
- Commit: ver `git log` (T-010)
