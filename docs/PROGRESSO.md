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

### T-303 — Tela de processamento (2026-11-20)
- Feito: `SeparationProgressPanel` (barra com o progresso real do evento, tempo decorrido a cada segundo, Cancelar com andamento e sem repetir o pedido, falha ao cancelar exibida no painel, erro com "Ver log técnico" e "Copiar log"), `SeparationContext` (ignora progresso fora de execução ativa), estado acima das rotas. Fixture `musica-longa.wav` (~64 s) e `e2e/global-setup.ts` gerando as fixtures antes dos E2E.
- Verificado: `pnpm verify` OK (239); `SeparationProgressPanel.test.tsx` 5 testes (relógio por segundo com timers falsos, andamento do Cancelar, falha ao cancelar, erro/copiar); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e processamento` 2 passed com o motor real (barra avança, tempo muda, trocar de tela em < 1 s e voltar com o progresso maior; Cancelar não grava nada e volta ao seletor).
- Revisor: REPROVADO (falha de cancelar engolida; testes fracos de andamento/relógio/navegação) → REPROVADO (edição do E2E não aplicada) → APROVADO.
- Observações: E2E exigem `LINE_SPLITTER_DEV_NO_SANDBOX=1` (DEC-008 pendente).
- Commit: ver `git log` (T-303)

### T-304 — Tela de resultado (2026-11-20)
- Feito: `SeparationResultPanel` (os dois MP3 com players, "Mostrar arquivo", "Abrir pasta", "Separar outro instrumento", "Novo arquivo"; botões desabilitados enquanto o sistema responde), `handlers/shell.ts` (só saídas registradas no histórico; gerenciador de arquivos injetável para teste).
- Verificado: `pnpm verify` OK (248); `shell.test.ts` 4 testes (recusa /etc/passwd, original, `../`, relativo; NOT_FOUND; IO); `SeparationResultPanel.test.tsx` 5 testes; `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e resultado` (motor real: 2 MP3 no disco e no SQLite, player da faixa carrega pelo `media://` com duração de 8 s e toca, abrir/mostrar chegam ao main com os caminhos certos, segunda separação e "Novo arquivo").
- Revisor: REPROVADO (duração da faixa não conferida no E2E) → corrigido → APROVADO.
- Commit: ver `git log` (T-304)

### T-400 + T-401 — Histórico e remoção (2026-11-20, DEC-014)
- Feito: `packages/shared/src/history.ts`, canais `history:list`/`history:remove`, `handlers/history.ts` (lista do SQLite mais recente primeiro, existência no disco, `media://` só para o que existe, um uso por arquivo liberado ao remover; remoção apaga só os dois MP3 do item quando pedido, nunca o original, erro mantém o registro e cita o que já foi apagado), `HistoryPage` (campos, ouvir, abrir pasta, "Arquivo não encontrado", vazio com link, carregando/erro, diálogo de remoção com "Apagar também os arquivos MP3").
- Verificado: `pnpm verify` OK (263); `pnpm --filter @line-splitter/desktop test history` 8 testes com SQLite real; `HistoryPage.test.tsx` 7 testes; `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e historico` com motor real (vazio → separar → item → ouvir → abrir pasta → arquivo apagado fora do app → remover apagando MP3 → disco e banco vazios, original intacto).
- Revisor: APROVADO (as duas). Sugestões aplicadas: uso único no `media://` liberado ao remover, mensagem cita arquivos já apagados, proteção extra contra apagar o original, caixa desabilitada durante o envio, sem região de anúncio por item.
- Commit: ver `git log` (T-400, T-401)

### T-500 — Identidade do app no desktop: ícone, nome e menu nativo em português (2026-11-20)
- Feito: `scripts/icons.mjs` (ícone gerado sem dependências: PNG 512/256 e ICO), `apps/desktop/build/` versionado, ícone na janela, configuração do electron-builder em `apps/desktop/package.json` (nome, ícones, `.desktop`, `extraResources`), `menu.ts` (Arquivo › Escolher arquivo…/Abrir pasta de saída/Sair, Editar, Ajuda › Sobre), correção de layout no tamanho mínimo (seletor de instrumento).
- Verificado: `pnpm verify` OK (267); `menu.test.ts`, `identity.test.ts`; `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e menu` 2 passed (nome/título/tamanho mínimo, ações do menu, sem rolagem horizontal em 880x600 em todos os estados com motor real).
- Revisor: REPROVADO (rolagem horizontal com arquivo carregado no tamanho mínimo) → corrigido → APROVADO.
- Commit: ver `git log` (T-500)

### T-501 — Garantia de privacidade/offline (2026-11-20)
- Feito: bloqueio de rede no renderer (`session.webRequest`, só app://, media:// e o Vite em dev), arquivos do build lidos direto do disco, variáveis offline do hub na separação, erro claro sem o modelo.
- Verificado: `pnpm verify` OK; `offline.test.ts` 4 testes (separação real com o processo do motor isolado da rede por `bwrap --unshare-net`); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e` 24 passed (inclui `offline`); modo dev conferido por screenshot.
- Revisor: APROVADO. Sugestão aplicada: `devtools:`/`chrome-extension:` também bloqueados.
- Observações: o teste de rede bloqueada depende do `bwrap` (bubblewrap) instalado; sem ele (outros sistemas) esse bloco não roda.
- Commit: ver `git log` (T-501)

### T-600 — E2E de todos os fluxos felizes do PRD (2026-11-20)
- Feito: `e2e/fluxos.spec.ts` (os 5 instrumentos pela interface com o motor real: 2 MP3 cada conferidos por ffprobe — mp3, 320 kbps, 44,1 kHz, estéreo, ~8 s — nomes corretos, progresso chegando a 100% e tempo decorrido, histórico com 5 itens e remover sem apagar); `resultado.spec.ts` passou a exercitar posição e volume do player. Demais fluxos em `envio`, `processamento`, `resultado` e `historico`.
- Verificado: `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e` 25 passed; `pnpm verify` OK.
- Revisor: APROVADO. Sugestões aplicadas: bitrate conferido no E2E; posição e volume do player.
- Observações: E2E exigem `LINE_SPLITTER_DEV_NO_SANDBOX=1` (DEC-008 pendente).
- Commit: ver `git log` (T-600)

### T-601 — E2E de erros, limites e cancelamento (2026-11-20)
- Feito: `e2e/erros.spec.ts` (corrompido, .wma, 31 min, 501 MB; erro real do motor com pesos inválidos → mensagem legível, log técnico, nada gravado, e a tela Motor oferece baixar de novo; cancelar no meio sem arquivos nem histórico; FFmpeg inválido leva à tela Motor). Produção: pesos recusados pelo Demucs são apagados e a mensagem orienta baixar de novo (`separation/errors.ts`, `service.ts`).
- Verificado: `pnpm verify` OK (271); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e` 29 passed.
- Revisor: REPROVADO (mensagem mandava baixar o modelo mas a tela Motor não oferecia; regex larga) → corrigido → APROVADO.
- Commit: ver `git log` (T-601)

### T-602 — Revisão de segurança do Electron (2026-11-20)
- Feito: `security-review.test.ts` (preferências seguras; todos os canais do contrato recusam payload inválido sem executar o handler; `guardSender` recusa origem não confiável com FORBIDDEN; varredura: `child_process` só em `engine/exec.ts` e `engine/process-tree.ts`, toda chamada de `spawn` com `shell: false`, sem `exec*`), `ipc.ts` com `guardSender` extraído, `e2e/seguranca.spec.ts` (preferências e CSP, sem Node no renderer, `window.open`/navegação externa/`<webview>`/câmera/microfone/notificações negados). Vitest atualizado para 4.1 (o `pnpm audit` acusava 2 críticas e 3 moderadas, todas em dependências de teste); matchers do jest-dom registrados explicitamente.
- Verificado: `pnpm --filter @line-splitter/desktop test security` 7 passed; `pnpm verify` OK (275); `pnpm audit` sem vulnerabilidades; `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e` 30 passed. Caminhos registrados/path traversal: `media.test.ts`, `shell.test.ts`, `history.test.ts`.
- Revisor: APROVADO. Reforços aplicados: varredura cobre qualquer import de `child_process`; `taskkill` com `shell: false` explícito.
- Observações: E2E com `LINE_SPLITTER_DEV_NO_SANDBOX=1` (DEC-008 pendente): o sandbox de processo do Chromium não foi exercitado nesta máquina.
- Commit: ver `git log` (T-602)

### T-603 — Desempenho (2026-11-21)
- Feito: `pnpm bench` (`apps/desktop/src/bench/separation.bench.ts`, configuração própria fora do `pnpm verify`): separa 4:00 de áudio (clipe sintético repetido, DEC-005) com o motor real em GPU — motor CUDA instalado pelo próprio instalador do app — e em CPU, e imprime os tempos. Responsividade medida dentro da página no E2E `processamento`: troca de tela durante a separação < 200 ms.
- Resultado do benchmark nesta máquina (RTX 3050 6 GB, 16 threads):
  - GPU (CUDA): 18,8 s para 4:00 de áudio (referência do PRD: ~2 min) → dentro da referência
  - CPU: 65,9 s para 4:00 de áudio (referência do PRD: ~10 min) → dentro da referência
  - Nenhum ajuste (`--segment`, `-j`) foi necessário.
- Verificado: `pnpm bench` (2 passed); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e processamento` 3 execuções seguidas, 2 passed cada; `pnpm verify` OK.
- Revisor: APROVADO (o revisor reproduziu: GPU 19,2 s, CPU 66,9 s). Sugestão aplicada: o benchmark confere que o motor CUDA ficou pronto após instalar.
- Commit: ver `git log` (T-603)

### T-604 — Acessibilidade e idioma (2026-11-21)
- Feito: `e2e/a11y.spec.ts` (auditoria axe WCAG 2.1 A/AA — inclui contraste — em todas as telas e estados: Início vazio/erro/arquivo, processamento, resultado, Motor pronto/com problema, instalação em andamento/cancelada/com falha, download em andamento/cancelado, Histórico vazio/com item, diálogo de remoção, Configurações com erro, página inexistente, separação com erro; varredura de textos de interface em inglês, ignorando só nomes/caminhos de arquivo marcados com `data-path` e saída técnica; fluxo principal, Configurações, Histórico, Motor e player só com teclado, com foco visível). `e2e/app.ts` isola a pasta de Música dos E2E (`e2e/isolamento.spec.ts`). Bug corrigido: Cancelar logo após "Instalar motor" era ignorado (o instalador agora resolve Python/variante depois de começar).
- Verificado: `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e a11y` 6 passed (estável em repetição); suíte completa 37 passed duas vezes seguidas; `pnpm verify` OK (276).
- Revisor: REPROVADO (cobertura parcial) → REPROVADO (instabilidade) → APROVADO.
- Observações: dois E2E de acessibilidade gravaram arquivos de teste na pasta Música real do usuário (`~/Music/Line Splitter`) antes do isolamento; os arquivos foram apagados. O isolamento da pasta de Música vale no Linux; o equivalente no Windows ficou como critério da T-901. E2E com `LINE_SPLITTER_DEV_NO_SANDBOX=1` (DEC-008 pendente).
- Commit: ver `git log` (T-604)

### T-900 — Instaladores Linux (AppImage e .deb) (2026-11-20)
- Feito: electron-builder 26 configurado em `apps/desktop/package.json`; `pnpm dist:linux` gera `release/Line-Splitter-0.1.0-x86_64.AppImage` e `release/line-splitter_0.1.0_amd64.deb` (depends ffmpeg, python3, python3-venv; perfil AppArmor no postinst). `better-sqlite3` vai com `prebuilds/` fora do asar; `shared`/`zod` embutidos pelo esbuild. Interface em `resources/renderer`. Teste de fumaça do pacote: `pnpm smoke:linux` (`e2e-pacote/appimage.spec.ts`). DEC-015.
- Verificado: `pnpm dist:linux` (2 pacotes); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm smoke:linux` → AppImage abre empacotado, detecta o motor, grava no SQLite e completa uma separação real (2 MP3 + histórico); `dpkg-deb -c/-I` no .deb; `pnpm verify` OK.
- Revisor: APROVADO (texto da DEC-015 corrigido conforme apontado).
- Observações: nesta máquina (Ubuntu 24.04) o AppImage só abre com `--no-sandbox` (AppArmor + chrome-sandbox sem SUID) e sem libfuse2 precisa de `APPIMAGE_EXTRACT_AND_RUN=1`; DEC-008 segue pendente. O .deb não foi instalado (exige sudo).
- Commit: ver `git log` (T-900)

### T-901 — Instalador Windows (NSIS) (2026-11-21) — BLOQUEADA
- Feito: script `pnpm dist:win` e config NSIS (artifactName, ícone .ico, diretório escolhível); `LINE_SPLITTER_MUSIC_DIR` isola a pasta de Música dos E2E em qualquer sistema (antes só via XDG no Linux). No caminho, corrigida corrida real do redirecionamento inicial (`StartupRedirect`) que vencia um clique do usuário durante a abertura (causa da falha intermitente do E2E de envio FLAC), com teste que reproduz a corrida.
- Verificado: `pnpm verify` OK; E2E completo 37 passed duas vezes; `pnpm smoke:linux` OK; mutação confirma o teste do StartupRedirect.
- Bloqueio: `pnpm dist:win` falha com "wine is required" (wine exige sudo para instalar) e a instalação real exige uma máquina Windows.
- Revisor: APROVADO para as mudanças commitadas; lacunas de teste dos ramos win32 viraram a T-901a.
- Commit: ver `git log` (T-901)

### T-901a — Ramos Windows testáveis no Linux (2026-11-21)
- Feito: `findAllInPath` (PATHEXT, `Path`, `;`, sem bit de execução no Windows, ignora `WindowsApps`); `detectPython` com plataforma injetável testando cada candidato até um funcionar; `killTree`/`spawnTree` com dependências injetáveis e taskkill com fallback (erro ao iniciar ou código ≠ 0); `checkExecutable` com plataforma. `windows.test.ts` com arquivos e scripts reais. DEC-016.
- Verificado: `pnpm verify` OK; E2E completo 37 passed; integração de cancelamento/instalação com motor real 19 passed.
- Revisor: APROVADO (observações 1 e 2 aplicadas: fallback no exit ≠ 0 com teste; DEC-016).
- Commit: ver `git log` (T-901a)

### T-902 — README de execução, testes, build e uso (2026-11-21) — BLOQUEADA (parte que exige sudo/Windows)
- Feito: README.md do projeto (uso, instaladores Linux/Windows, primeiro uso, separar, histórico, configurações, desenvolvimento, comandos, variáveis, estrutura); o README do kit de fluxo com IA foi movido para `docs/FLUXO-IA.md`.
- Verificado num clone limpo: `pnpm install`, `pnpm verify`, `pnpm fixtures`, `pnpm test` (295), `pnpm test:e2e envio` (4), `pnpm bench` (GPU 19,3 s, CPU 67,6 s), `pnpm dist:linux`, `pnpm smoke:linux` (1), `pnpm dev`; `pnpm dist:win` falha pedindo wine (documentado). Correções vindas da execução: `corepack` não existe no Node 26 → `npm install -g pnpm@10`. Perfil do AppArmor do README validado com `apparmor_parser --skip-kernel-load` (pelo revisor).
- Revisor: REPROVADO (Python 3.9–3.13, referência ao benchmark, nota do bench com GPU, aviso do instalador Windows, .exe incompleto em release/) → corrigido. Comandos com sudo/Windows ficaram como bloqueio; a falta de limite superior do Python virou a T-902a.
- Bloqueio: instalar o .deb, testar o perfil do AppArmor do AppImage e instalar no Windows (precisam de sudo/Windows).
- Commit: ver `git log` (T-902)

### T-902a — Motor recusa Python fora da faixa do PyTorch 2.6 (2026-11-21)
- Feito: `MAX_PYTHON = [3, 13]` em `packages/shared`; `detectPython` recusa < 3.9 e > 3.13 com mensagem citando a faixa e segue para o próximo candidato do PATH. Testes com interpretadores reais (scripts) para 3.8, 3.13, 3.14, 3.14 antes de 3.12 no PATH e Python configurado 3.14.
- Verificado: `pnpm verify` OK (298); `LINE_SPLITTER_DEV_NO_SANDBOX=1 pnpm test:e2e motor instalacao` 4 passed.
- Revisor: APROVADO. Observação não bloqueante: no Windows o lançador `py` usa o Python padrão (não tenta `py -3.12` se o padrão for 3.14).
- Commit: ver `git log` (T-902a)
