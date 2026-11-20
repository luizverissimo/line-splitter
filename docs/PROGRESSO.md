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

### T-006b — E2E de preferência gravada pela UI sobrevivendo ao reinício (2026-11-20)
- Feito: `e2e/preferencias.spec.ts` — confere o padrão 320, troca para 192 na tela Configurações, salva, fecha, reabre (novo processo, mesma pasta de dados), vê 192 e confere `settings.bitrateKbps` no `line-splitter.db` real.
- Verificado: `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e preferencias` 1 passed; suíte completa 6 passed; `pnpm verify` OK.
- Revisor: APROVADO.
- Observações: E2E exigem `LINE_SPLITTER_DEV_NO_SANDBOX=1` nesta máquina (DEC-008 pendente de aprovação do usuário).
- Commit: ver `git log` (T-006b)

### T-006 — Playwright para Electron com um E2E real (2026-11-20)
- Feito: concluída via T-006a (infraestrutura + fundação) e T-006b (preferência pela UI persistida).
- Verificado: `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e` 6 passed.
- Revisor: APROVADO.
- Commit: mesmo commit da T-006b.

### T-100 — Detecção do ambiente do motor (Python, demucs, FFmpeg, modelo, GPU) (2026-11-20)
- Feito: `apps/desktop/src/main/engine/` — `paths.ts` (venv, TORCH_HOME e repositório local de modelos em `userData/engine`), `exec.ts` (execução sem shell com tempo limite, busca no PATH com PATHEXT), `detect.ts` (Python ≥ 3.9, FFmpeg + ffprobe executados com versão, Demucs/PyTorch/CUDA por sonda validada com Zod, modelo por tamanho e yaml exato, dispositivo efetivo a partir de Auto/GPU/CPU); canal `engine:status`.
- Verificado: `pnpm verify` OK (132 testes; 19 de detecção reais: Python/FFmpeg do sistema e por caminho configurado, ffprobe quebrado, venv real sem demucs, sonda inválida, modelo ausente/incompleto/yaml errado). Numa venv de teste com torch 2.6.0+cu124 + demucs 4.1.0: CUDA na RTX 3050 detectada e separação real com `--repo` em ~5 s.
- Revisor: REPROVADO (ffprobe não validado; faltava teste de caminho configurado válido) → corrigido → APROVADO.
- Observações: DEC-011 (repositório local do modelo; numpy necessário para o Demucs 4.1).
- Commit: ver `git log` (T-100)

### T-101 — Tela de configuração do motor (2026-11-20)
- Feito: `apps/web/src/pages/EnginePage.tsx` (resumo, ✔/✖ por item com detalhe, dispositivo em uso, instruções de instalação de Python/FFmpeg pela plataforma do `app:info` — as duas plataformas com aviso se ela não for identificada —, "Verificar de novo", carregando/erro), `StartupRedirect` (na abertura, motor incompleto → Motor; decide só pela primeira resposta), `useEngineStatus`.
- Verificado: `pnpm verify` OK (143 testes; 11 da tela/redirecionamento — o teste de redirecionamento tardio falha se o bug voltar, conferido); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e motor` 2 passed (status real na abertura; Python inválido → reabrir cai sozinho na tela Motor com ✖ e instruções; volta a ✔ com "Verificar de novo"); tela conferida por screenshot.
- Revisor: REPROVADO (E2E não provava o redirecionamento; fallback silencioso para Linux) → corrigido → APROVADO; ressalva do teste tardio corrigida.
- Commit: ver `git log` (T-101)

### T-102 — Instalar/reinstalar motor (venv + torch + demucs com log ao vivo) (2026-11-20)
- Feito: `apps/desktop/src/main/engine/install.ts` (5 etapas: venv, pip, PyTorch CUDA 12.4 ou CPU conforme `nvidia-smi`, Demucs 4.1.0 + numpy, conferência importando o Demucs; log linha a linha por evento IPC e em `engine/install.log`; cancelar mata a árvore de processos e apaga o venv; falhas traduzidas — rede, python3-venv, disco, versão), `process-tree.ts`, `events.ts` (broadcast validado), canais `engine:install`/`engine:cancelInstall`, eventos `engine:installStep`/`engine:installLog`; web: `EngineInstallProvider` (estado acima das rotas), `EngineInstallPanel` (progresso por etapa, log ao vivo, cancelar, erro com log técnico), "Reinstalar motor…" com confirmação nas Configurações.
- Verificado: `pnpm verify` OK; `pnpm --filter @line-splitter/desktop test engine-install` 8 testes reais (venv criado do zero e Demucs importado com PyTorch CPU; cancelar no meio e na conferência; sem rede via proxy inalcançável; conflito; canal sem Python); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e instalacao` 2 passed (etapas + log + cancelar pela UI; falha de rede). Variante CUDA conferida manualmente com os mesmos comandos (DEC-011); a instalação CUDA completa pelo E2E não roda por falta de disco (≈14 GB livres).
- Revisor: REPROVADO (Verificar não casava com o arquivo de teste; venv persistente no teste; cancelamento na etapa 5; remoção no Windows; log completo; testes do canal) → corrigido → REPROVADO (início fora do try; catch vazio no log) → corrigido → APROVADO.
- Commit: ver `git log` (T-102)

### T-103 — Download dos pesos do `htdemucs_6s` com progresso (2026-11-20)
- Feito: `apps/desktop/src/main/engine/model.ts` (download por `pipeline` com Transform de hash/progresso/limite, `.parcial` renomeado só no fim, tamanho e SHA-256 completo conferidos, erros de rede e de disco legíveis, cancelamento), canais `engine:downloadModel`/`engine:cancelDownload`, evento `engine:modelProgress`; web: `ModelDownloadProvider` e `ModelDownloadPanel` (progresso em bytes, cancelar, "Tentar de novo"); `e2e/engine-fixture.ts` (motor real de teste — instalador do app, CPU — + modelo, reutilizável pelos E2E de separação).
- Verificado: `pnpm verify` OK (172 testes); `pnpm --filter @line-splitter/desktop test model` 10 passed (servidor HTTP local real: progresso, checksum, truncado, maior, 404, inalcançável, cancelar, sem permissão, ENOSPC real via /dev/full; download real do servidor oficial); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e modelo` 3 passed (download real pela UI; cancelar; com motor e modelo prontos tudo ✔ e o app abre no Início sem baixar nada).
- Revisor: REPROVADO (erro de disco sem tratamento travava o download) → corrigido → APROVADO.
- Observações: texto do `Verificar:` corrigido para `pnpm --filter @line-splitter/desktop` também em tarefas já concluídas (só texto).
- Commit: ver `git log` (T-103)

### T-200 — Validação do arquivo de entrada no processo principal (2026-11-20)
- Feito: `packages/shared/src/audio.ts` (extensões aceitas, limites de 500 MB e 30 min, validação rápida para o cliente, mensagens pt-BR, schema de entrada/saída), canal `audio:inspect`, `apps/desktop/src/main/audio/inspect.ts` (stat, extensão, tamanho antes do ffprobe, leitura pelo ffprobe validada com Zod, duração), `handlers/audio.ts` (`CurrentInput`: libera no protocolo `media://` só o arquivo atual). Fixtures ganharam `.aac` (ADTS) e tipos JSDoc.
- Verificado: `pnpm verify` OK (194 testes); `pnpm --filter @line-splitter/desktop test audio` com fixtures reais (6 formatos, corrompido, texto .wav, MP3 como .wma, 501 MB, 31 min, inexistente, pasta, vazio, ffprobe ausente, acentos, maiúsculas, original intacto por hash/mtime, canal com revogação).
- Revisor: REPROVADO (faltava `.aac`; mensagem "30:00" no limite) → corrigido → APROVADO.
- Commit: ver `git log` (T-200)

### T-201 — Tela Início: arrastar e soltar, escolher arquivo, metadados e player do original (2026-11-20)
- Feito: `apps/web/src/pages/HomePage.tsx` (diálogo nativo com filtro + conferência de extensão no cliente, metadados, player do original por `media://`, estados vazio/carregando/erro, contador de requisição), `apps/web/src/state/FileDropContext.tsx` (soltar na janela inteira, overlay, em outra tela leva ao Início, ignora durante a inspeção), `pathForFile` no preload (`webUtils.getPathForFile`). Correção encontrada pelo E2E: `StartupRedirect` não redireciona se o usuário já navegou antes da primeira verificação do motor.
- Verificado: `pnpm verify` OK (206 testes); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e envio` 4 passed (diálogo + metadados reais + o player toca o original; soltar fora da caixa em outra tela; arrastar FLAC com arquivo real do disco; corrompido e .wma recusados; hash do original igual).
- Revisor: REPROVADO (soltar só na caixa; inspeções concorrentes; destaque piscando; caminho do diálogo sem validação no cliente) → corrigido → APROVADO. Sugestão aplicada: overlay avisa quando o soltar está bloqueado.
- Commit: ver `git log` (T-201)

### T-300 + T-301 — Escolha do instrumento e serviço de separação real (2026-11-20, DEC-012)
- Feito (T-300): `packages/shared/src/instruments.ts` (5 instrumentos → stems; rótulo de arquivo com hífen no lugar da barra, DEC-013), `InstrumentPicker` (cartões com ícone, radio nativo, teclado), fluxo no Início com "Separar" habilitado só com instrumento escolhido e motor pronto (mensagens enquanto verifica ou se falhar), estado do Início acima das rotas (`HomeStateContext`).
- Feito (T-301): `packages/shared/src/separation.ts`, canais `separation:start`/`separation:cancel`, evento `separation:progress`; `apps/desktop/src/main/separation/service.ts` (Demucs `htdemucs_6s --two-stems --repo` em pasta temporária com progresso do tqdm, FFmpeg para MP3 no bitrate configurado 44,1 kHz estéreo, nomes com sufixo de conflito, `COPYFILE_EXCL`, exatamente dois arquivos, registro no histórico, saídas liberadas no `media://`), `history/repository.ts`, contagem de referências no `MediaRegistry`; o renderer só envia o stem (o caminho é a entrada atual validada).
- Verificado: `pnpm verify` OK; `pnpm --filter @line-splitter/desktop test separation` 7 testes com Demucs/FFmpeg reais (motor de teste CPU): MP3 conferidos por ffprobe (codec, 320/192 kbps, 44100 Hz, 2 canais), nomes, sufixo (2), SQLite, hash do original, progresso, conflito; `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e` 18 passed (inclui `resultado`: fluxo completo pela UI).
- Revisor: REPROVADO (re-registro da entrada atual mantinha arquivo antigo liberado; "Separar" sem explicação durante verificação do motor; rótulo de arquivo sem decisão; estado perdido ao navegar) → corrigido → APROVADO (as duas).
- Commit: ver `git log` (T-300, T-301)

### T-302 — Cancelamento e tratamento de erros do motor (2026-11-20)
- Feito: `separation/service.ts` (cancelar mata a árvore de processos do Demucs/FFmpeg, apaga a pasta temporária, ignora progresso depois do Cancelar; ENGINE_MISSING com o detalhe dos itens), `separation/errors.ts` (memória GPU/RAM, `LoadAudioError`/arquivo ilegível, motor incompleto, processo encerrado; log técnico no `details`).
- Verificado: `pnpm verify` OK (236); `apps/desktop/src/main/separation/cancel.test.ts` 8 testes com motor real: cancelar durante o Demucs (grupo de processos some em < 800 ms, nenhuma fase depois) e durante o FFmpeg (morto por SIGKILL), cancelar no início, processo morto de fora, arquivo trocado, entrada que o próprio Demucs rejeita (LoadAudioError), motor incompleto — sem saída nem histórico. Mutação com `killTree` vazio faz os dois testes de cancelamento falharem.
- Revisor: REPROVADO (testes não provavam a morte dos processos; faltava rejeição real do Demucs; ENGINE_MISSING sem log) → REPROVADO (teste do FFmpeg e histórico no cancelar inicial) → APROVADO.
- Commit: ver `git log` (T-302)
