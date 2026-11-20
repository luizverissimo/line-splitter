# Plano de tarefas

Status do plano: APROVADO

<!--
Gerado por /planejar. Formato (o script .claude/scripts/tasks.mjs depende dele):

## Fase N — Nome da fase

- [ ] **T-012** Título curto da tarefa — req: RF-03, RN-02 · dep: T-010, T-011
  - Critérios:
    - critério verificável 1
    - critério verificável 2
  - Verificar: `comando que prova que funciona`

Status: [ ] pendente · [~] em andamento · [x] feito · [!] bloqueado (com "- Bloqueio: motivo") · [-] cancelado (com "- Decisão: DEC-xxx")
-->

> Fase 0 adaptada ao PRD (§4): app desktop local, sem API HTTP, PostgreSQL/Docker, Prisma ou Capacitor. Ver DEC-001.

## Fase 0 — Fundação

- [x] **T-001** Monorepo pnpm + TS strict + ESLint + Prettier + Vitest + `pnpm verify` — req: RNF-03
  - Critérios:
    - `pnpm-workspace.yaml` com `apps/*` e `packages/*`; `tsconfig.base.json` com `strict: true` herdado por todos os pacotes
    - ESLint (flat config, typescript-eslint) e Prettier configurados na raiz; `pnpm lint` e `pnpm format:check` passam
    - Vitest configurado em modo workspace; `pnpm test` roda os testes de todos os pacotes
    - `pnpm verify` = typecheck + lint + testes + `node .claude/scripts/anti-mock.mjs`, e falha se qualquer etapa falhar
  - Verificar: `pnpm install && pnpm verify`

- [x] **T-002** `packages/shared`: schemas Zod e contrato IPC tipado — req: RNF-03, RNF-04 · dep: T-001
  - Critérios:
    - Define o contrato dos canais IPC (nome do canal → schema de entrada e de saída) e dos eventos main → renderer
    - Helpers `defineHandler` (main) e `invoke` (renderer) que validam entrada e saída com Zod nos dois lados
    - Entrada inválida gera erro padronizado `{ code, message }` com mensagem em português
    - Testes de unidade cobrem payload válido, inválido e resposta fora do schema
  - Verificar: `pnpm --filter shared test && pnpm verify`

- [x] **T-003** `apps/web`: React + Vite, rotas, layout base escuro, TanStack Query sobre IPC — req: RNF-07, RNF-08, RNF-09 · dep: T-002
  - Critérios:
    - Rotas (React Router, hash router para funcionar via arquivo empacotado): Início, Motor, Histórico, Configurações
    - Layout com navegação lateral, tema escuro e todos os textos em português
    - Cliente TanStack Query que chama `window.api` (preload) via helpers de `packages/shared`; nenhum `fetch` para rede
    - Error boundary global e componente de erro de consulta com "Tentar de novo"
    - Teste de componente do layout e do error boundary
  - Verificar: `pnpm --filter web test && pnpm --filter web build && pnpm verify`

- [x] **T-004** `apps/desktop`: Electron seguro carregando o web (dev e build) — req: RNF-04, RNF-12 · dep: T-003
  - Critérios:
    - `BrowserWindow` com `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; preload expõe só `window.api` tipado
    - CSP restritiva aplicada ao renderer; navegação externa e `window.open` bloqueados
    - `pnpm dev` abre o app com o Vite dev server; `pnpm --filter desktop build` gera build que carrega os arquivos do web empacotados
    - Instância única (segunda abertura foca a janela existente); app abre direto, sem login
    - `.env.example` documenta `LINE_SPLITTER_USER_DATA` (pasta de dados alternativa, usada nos testes) e o app valida a variável se definida
    - Canal IPC `app:info` (versão, plataforma) exibido no rodapé, provando o caminho renderer → preload → main
  - Verificar: `pnpm --filter desktop build && pnpm verify` e abrir o app com `pnpm dev`

- [x] **T-005** Banco SQLite local (`better-sqlite3`) com migrações — req: RF-25 · dep: T-004
  - Critérios:
    - Banco em `userData/line-splitter.db` (ou `LINE_SPLITTER_USER_DATA`), aberto só no processo principal
    - Migrações versionadas criam as tabelas `settings` e `separations`; rodam automaticamente ao abrir
    - Módulo nativo carrega no Electron e no Node dos testes (prebuild N-API do `better-sqlite3@13`, sem recompilação — DEC-009)
    - Testes de integração contra arquivo SQLite real temporário (migração do zero, migração idempotente, leitura/escrita)
  - Verificar: `pnpm --filter desktop test db && pnpm verify`

- [x] **T-006** Playwright para Electron com um E2E real — req: RNF-13 · dep: T-006a, T-006b
  - Critérios:
    - Playwright `_electron` abre o app empacotado em modo teste com `LINE_SPLITTER_USER_DATA` temporário
    - E2E grava uma preferência pela UI, reinicia o app e confirma que ela veio do SQLite real
    - Script `pnpm test:e2e` na raiz; screenshots/trace salvos em falha
    - Concluída quando T-006a e T-006b estiverem `[x]` (a tela de preferências só existe a partir da T-010)
  - Verificar: `pnpm test:e2e`

- [x] **T-006a** Infraestrutura Playwright `_electron` + E2E UI → IPC → main → SQLite — req: RNF-13 · dep: T-005
  - Critérios:
    - `playwright.config.ts` e helper que abre o app empacotado com `LINE_SPLITTER_USER_DATA` temporário e isolado por teste
    - E2E: rodapé mostra nome/versão/plataforma vindos do IPC real; banco `line-splitter.db` criado e migrado na pasta do teste
    - E2E: reiniciar o app reabre o mesmo banco sem reaplicar migrações e com os dados preservados
    - `pnpm test:e2e` na raiz builda e roda; `forbidOnly`; screenshots/trace em falha
  - Verificar: `pnpm test:e2e`

- [x] **T-006b** E2E de preferência gravada pela UI sobrevivendo ao reinício — req: RNF-13 · dep: T-006a, T-010
  - Critérios:
    - E2E altera uma preferência na tela Configurações, fecha o app, reabre e vê o valor salvo
    - O valor é conferido também lendo o `line-splitter.db` real da pasta do teste
  - Verificar: `pnpm test:e2e preferencias`

- [x] **T-007** Fixtures de áudio gerados com FFmpeg real e helpers de teste — req: RNF-10 · dep: T-001
  - Critérios:
    - Script gera em `fixtures/` (git-ignorado) clipes curtos sintéticos (tons + ruído + percussão sintetizada, ~8 s) em MP3, WAV, FLAC, M4A e OGG
    - Gera também um arquivo corrompido, um com extensão errada e um WAV de 31 min (gerado sob demanda) para os testes de limite
    - Helper de teste `probe(path)` usa `ffprobe` real para conferir codec, bitrate, sample rate e canais
    - Testes rodam o script antes (globalSetup) e não dependem de arquivos baixados
  - Verificar: `pnpm fixtures && pnpm verify`

## Fase 1 — Núcleo

- [x] **T-010** Configurações persistidas (IPC + tela) — req: RF-24, RF-25, RN-07, RN-08 · dep: T-005, T-006a, T-011
  - Critérios:
    - IPC `settings:get` e `settings:update` validados com Zod no main; valores salvos no SQLite
    - Padrões: pasta de saída `app.getPath('music')/Line Splitter`, bitrate 320, dispositivo Auto, caminhos de Python e FFmpeg vazios (= detectar no PATH)
    - Tela Configurações: escolher pasta (diálogo nativo), bitrate (192/256/320), dispositivo (Auto/GPU/CPU), caminhos de Python e FFmpeg (diálogo nativo), com validação no cliente e no main (caminho existe e é executável/gravável)
    - Estados carregando/erro e confirmação visual ao salvar
    - Testes de integração do repositório de configurações contra SQLite real e teste de componente da tela
  - Verificar: `pnpm verify && pnpm test:e2e configuracoes`

- [x] **T-011** Componentes base de UI e protocolo seguro de mídia — req: RF-16, RNF-04, RNF-07 · dep: T-004
  - Critérios:
    - Componentes: botão, cartão selecionável, barra de progresso, diálogo de confirmação, alerta de erro com detalhes expansíveis, estado vazio, spinner
    - Player de áudio com play/pause, barra de posição arrastável, tempo atual/total e volume
    - Protocolo `media://` registrado no main que só serve arquivos de uma lista permitida (entrada atual e saídas registradas), com suporte a Range; qualquer outro caminho retorna 403
    - Testes de componente do player e teste de integração do protocolo (caminho permitido, negado, Range)
  - Verificar: `pnpm verify`

## Fase 2 — Motor de separação

- [x] **T-100** Detecção do ambiente do motor (Python, demucs, FFmpeg, modelo, GPU) — req: RF-01, RF-06, RF-24 · dep: T-010
  - Critérios:
    - Localiza Python ≥ 3.9 e FFmpeg/ffprobe no PATH ou no caminho configurado, informando versão encontrada
    - Verifica o venv gerenciado em `userData/engine`, se `demucs` importa nele e se os pesos do `htdemucs_6s` estão no cache do torch (repositório local `userData/engine/models` usado com `--repo`, DEC-011)
    - Detecta CUDA via `torch.cuda.is_available()` no venv e resolve o dispositivo efetivo a partir da configuração (Auto/GPU/CPU)
    - IPC `engine:status` retorna um objeto por item `{ ok, detalhe }`; validado com Zod
    - Testes de integração reais nesta máquina (Python/FFmpeg presentes, caminho configurado inválido → item ✖)
  - Verificar: `pnpm --filter desktop test engine && pnpm verify`

- [x] **T-101** Tela de configuração do motor — req: RF-02, RF-05, RF-06 · dep: T-100
  - Critérios:
    - Ao abrir, se algum item estiver ✖, o app vai para a tela Motor; com tudo ✔ vai para Início
    - Lista cada item com ✔/✖ e detalhe (versão ou motivo), e o dispositivo em uso (GPU nome/CPU)
    - Sem Python ou FFmpeg: instruções de instalação para Linux (apt) e Windows (instalador/winget), escolhidas pela plataforma atual, e botão "Verificar de novo" que refaz `engine:status`
    - Estados carregando e erro
    - E2E: caminho de Python inválido nas Configurações leva à tela Motor com Python ✖
  - Verificar: `pnpm verify && pnpm test:e2e motor`

- [ ] **T-102** Instalar/reinstalar motor (venv + torch + demucs com log ao vivo) — req: RF-03, RF-24, RN-12 · dep: T-101
  - Critérios:
    - "Instalar motor" cria venv em `userData/engine` e instala torch (build CUDA se `nvidia-smi` detectar GPU, CPU caso contrário) e `demucs`, com versões fixadas registradas em DECISOES (DEC-011: torch 2.6.0 + demucs 4.1.0, sem torchaudio)
    - Saída do pip transmitida ao vivo para a tela por evento IPC; botão de cancelar instalação que encerra o processo e deixa o venv removido
    - Falha (sem internet, pip com erro) mostra mensagem legível e o log completo
    - "Reinstalar motor" nas Configurações apaga e recria o venv, com confirmação
    - Teste de integração real cria o venv numa pasta temporária e importa `demucs` (marcado como lento, executado no `pnpm verify`)
  - Verificar: `pnpm --filter desktop test engine-install && pnpm verify`

- [ ] **T-103** Download dos pesos do `htdemucs_6s` com progresso — req: RF-04, RN-12, RNF-11 · dep: T-102
  - Critérios:
    - Baixa os pesos para o cache do torch do motor com barra de progresso real (bytes recebidos/total)
    - Confere o checksum esperado pelo Demucs; arquivo incompleto/corrompido é apagado e o erro aparece com "Tentar de novo"
    - Com os pesos presentes, `engine:status` fica todo ✔ e o app segue para Início sem precisar de rede
    - Teste de integração real do download e da verificação de integridade
  - Verificar: `pnpm --filter desktop test model && pnpm verify`

## Fase 3 — Envio de áudio

- [ ] **T-200** Validação do arquivo de entrada no processo principal — req: RN-01, RN-02, RN-03 · dep: T-100, T-007
  - Critérios:
    - IPC `audio:inspect(path)` valida extensão (mp3, wav, flac, m4a, aac, ogg), tamanho ≤ 500 MB, leitura pelo `ffprobe` e duração ≤ 30 min
    - Retorna nome, duração, formato/codec, sample rate e canais; erros com códigos e mensagens em português (ex.: "Arquivo corrompido ou formato não suportado")
    - Arquivo de entrada só é lido; nada é escrito ao lado dele
    - Testes de integração com os fixtures reais: cada formato válido, corrompido, extensão errada, 31 min
  - Verificar: `pnpm --filter desktop test audio && pnpm verify`

- [ ] **T-201** Tela Início: arrastar e soltar, escolher arquivo, metadados e player do original — req: RF-07, RF-08, RF-09, RN-01, RN-03, RN-11 · dep: T-200, T-011
  - Critérios:
    - Área de soltar arquivo (caminho obtido com `webUtils.getPathForFile` no preload) com destaque visual ao arrastar
    - Botão "Escolher arquivo" abre diálogo nativo filtrado pelos formatos aceitos
    - Validação no cliente (extensão e tamanho) antes de chamar o main, e erros do main exibidos na tela
    - Após validar, mostra nome, duração, formato e player do original via `media://`
    - Estados carregando (inspecionando), vazio (nenhum arquivo) e erro
    - E2E: escolher fixture WAV mostra metadados corretos; arquivo corrompido mostra erro
  - Verificar: `pnpm verify && pnpm test:e2e envio`

## Fase 4 — Separação

- [ ] **T-300** Escolha do instrumento — req: RF-10, RN-04, RN-05 · dep: T-201
  - Critérios:
    - Após carregar o arquivo, aparecem 5 cartões com ícone: Voz, Bateria, Baixo, Guitarra/Violão, Piano/Teclado; seleção única, operável por teclado
    - Mapeamento instrumento → stem definido em `packages/shared` e validado com Zod no main
    - Botão "Separar" desabilitado até haver seleção
    - Teste de unidade do mapeamento e de componente da seleção
  - Verificar: `pnpm verify`

- [ ] **T-301** Serviço de separação real (Demucs → MP3 → pasta de saída → histórico) — req: RF-11, RF-15, RF-19, RN-06, RN-07, RN-09, RN-10, RN-11, RNF-10 · dep: T-300, T-103
  - Critérios:
    - Executa `python -m demucs -n htdemucs_6s --two-stems=<stem> -d <cuda|cpu>` do venv numa pasta temporária, emitindo progresso (%) lido da saída por evento IPC
    - Converte as duas faixas com FFmpeg para MP3 no bitrate configurado, 44,1 kHz, estéreo
    - Move para a pasta de saída como `<nome> - <Instrumento>.mp3` e `<nome> - sem <Instrumento>.mp3`, com sufixo ` (2)`, ` (3)`… se já existirem; cria a pasta se faltar
    - Garante exatamente dois arquivos; o original tem o mesmo hash antes e depois
    - Segunda chamada enquanto uma roda é recusada com erro "Já existe uma separação em andamento"
    - Ao concluir grava em `separations` (data, original, instrumento, duração do processamento, caminhos)
    - Teste de integração real com fixture de 8 s: 2 MP3 conferidos por `ffprobe` (codec mp3, bitrate, 44100 Hz, 2 canais), nomes, sufixo de conflito e registro no SQLite
  - Verificar: `pnpm --filter desktop test separation && pnpm verify`

- [ ] **T-302** Cancelamento e tratamento de erros do motor — req: RF-13, RF-14, RN-13 · dep: T-301
  - Critérios:
    - `separation:cancel` encerra a árvore de processos (Demucs e FFmpeg) e apaga a pasta temporária
    - Cancelada ou com erro: nenhum arquivo na pasta de saída e nenhum registro concluído em `separations`
    - Erros traduzidos para mensagens legíveis: falta de memória (RAM/VRAM), arquivo inválido, processo encerrado inesperadamente, motor ausente
    - Log técnico completo (stderr) retornado junto ao erro
    - Testes de integração reais: cancelar no meio, processo morto externamente, entrada que o Demucs rejeita
  - Verificar: `pnpm --filter desktop test separation && pnpm verify`

- [ ] **T-303** Tela de processamento — req: RF-12, RF-13, RF-14, RNF-05 · dep: T-302
  - Critérios:
    - Barra com o progresso real recebido por evento IPC e tempo decorrido atualizado a cada segundo
    - Botão "Cancelar" com retorno visual até o cancelamento terminar, voltando à escolha de instrumento
    - Erro mostra mensagem legível e "Ver log técnico" (expansível, com botão copiar)
    - Durante o processamento a UI continua responsiva (navegar para Histórico/Configurações e voltar mantém o progresso)
    - Teste de componente com eventos de progresso, cancelamento e erro
  - Verificar: `pnpm verify && pnpm test:e2e processamento`

- [ ] **T-304** Tela de resultado — req: RF-15, RF-16, RF-17, RF-18 · dep: T-303
  - Critérios:
    - Mostra os nomes dos dois MP3 gerados, cada um com o player (play/pause, posição, volume)
    - "Abrir pasta" (`shell.openPath`) e "Mostrar arquivo" (`shell.showItemInFolder`), aceitos no main só para caminhos registrados
    - "Separar outro instrumento" volta à escolha mantendo o mesmo arquivo; "Novo arquivo" volta ao Início limpo
    - E2E do fluxo completo com fixture: escolher arquivo → Voz → Separar → resultado com 2 arquivos existentes no disco
    - E2E toca uma faixa liberada via `media://` no Electron real (metadados carregam, duração correta, play avança o tempo)
  - Verificar: `pnpm verify && pnpm test:e2e resultado`

## Fase 5 — Histórico

- [ ] **T-400** Tela de histórico — req: RF-19, RF-20, RF-22, RF-23 · dep: T-304
  - Critérios:
    - IPC `history:list` lê `separations` do SQLite, mais recente primeiro, e confere no disco se cada saída existe
    - Lista data, arquivo original, instrumento, duração do processamento e caminhos das saídas
    - Ações: ouvir cada faixa (player) e abrir pasta; item com arquivo ausente mostra "arquivo não encontrado" e desabilita ouvir
    - Estado vazio convidando a fazer a primeira separação, com link para Início; estados carregando e erro
    - Testes de integração do IPC contra SQLite real e E2E com um arquivo apagado fora do app
  - Verificar: `pnpm verify && pnpm test:e2e historico`

- [ ] **T-401** Remover do histórico (opção de apagar os MP3) — req: RF-21 · dep: T-400
  - Critérios:
    - Diálogo de confirmação com caixa "Apagar também os arquivos MP3"
    - IPC `history:remove({ id, deleteFiles })` remove o registro e, se pedido, apaga só os caminhos registrados daquele item (nunca o original)
    - Lista atualiza após remover; erro ao apagar arquivo é exibido sem perder o registro
    - Testes de integração (com e sem apagar arquivos) e E2E
  - Verificar: `pnpm verify && pnpm test:e2e historico`

## Fase 6 — Recursos de plataforma

- [ ] **T-500** Identidade do app no desktop: ícone, nome e menu nativo em português — req: RNF-01, RNF-09 · dep: T-004
  - Critérios:
    - Ícone do app em PNG (256/512) e ICO, usado na janela e nos instaladores
    - Nome "Line Splitter" na janela, na barra de tarefas e no `.desktop` do Linux
    - Menu nativo em português (Arquivo › Escolher arquivo…, Abrir pasta de saída, Sair; Ajuda › Sobre) com ações reais
    - Janela com tamanho mínimo que não quebra o layout
  - Verificar: `pnpm verify && pnpm test:e2e menu`

- [ ] **T-501** Garantia de privacidade/offline — req: RN-12, RNF-11 · dep: T-301
  - Critérios:
    - Renderer bloqueia qualquer requisição de rede (`session.webRequest`), exceto `media://` e os arquivos do app
    - Separação executada com variáveis que impedem download (`TORCH_HOME` do motor, sem pip) e falha com mensagem clara se o modelo faltar, em vez de baixar
    - Teste de integração: separação completa com a rede do processo filho bloqueada funciona com o modelo presente
  - Verificar: `pnpm --filter desktop test offline && pnpm verify`

## Fase 7 — Qualidade

- [ ] **T-600** E2E de todos os fluxos felizes do PRD — req: RF-07, RF-08, RF-09, RF-10, RF-12, RF-15, RF-16, RF-17, RF-18, RF-19, RF-20, RF-21, RF-22, RF-23, RNF-13 · dep: T-401, T-501
  - Critérios:
    - Envio por diálogo e por arrastar e soltar
    - Cada um dos 5 instrumentos gera 2 MP3 válidos (conferidos com `ffprobe`) com nomes corretos
    - Progresso avança até 100% e tempo decorrido aparece
    - Resultado: players tocam, "Separar outro instrumento" e "Novo arquivo" funcionam
    - Histórico lista as separações, ouvir funciona, remover (com e sem apagar arquivos) e "arquivo não encontrado"
  - Verificar: `pnpm test:e2e`

- [ ] **T-601** E2E de erros, limites e cancelamento — req: RF-02, RF-05, RF-13, RF-14, RN-02, RN-03, RN-13 · dep: T-600
  - Critérios:
    - Arquivo corrompido, extensão não aceita e arquivo de 31 min mostram o erro correto
    - Cancelar no meio não deixa arquivos na pasta de saída nem item no histórico
    - Erro do motor exibe mensagem legível e log técnico
    - Python/FFmpeg ausentes (caminho inválido) levam à tela Motor com instruções e "Verificar de novo"
  - Verificar: `pnpm test:e2e`

- [ ] **T-602** Revisão de segurança do Electron — req: RNF-04 · dep: T-600
  - Critérios:
    - Teste automatizado confere `contextIsolation`, `sandbox`, `nodeIntegration: false` e CSP em todas as janelas
    - Todo canal IPC tem schema Zod de entrada; teste percorre o contrato e envia payload inválido a cada canal
    - Teste automatizado da recusa de IPC vindo de origem não confiável (`FORBIDDEN`) e de `SECURE_WEB_PREFERENCES`
    - Navegação, `window.open`, `webview` e permissões (câmera, microfone etc.) negados por padrão
    - `media://`, `shell.openPath`, `showItemInFolder` e exclusão de arquivos só aceitam caminhos registrados (teste com path traversal)
    - Processos filhos chamados com `spawn` e lista de argumentos (sem shell); `pnpm audit` sem vulnerabilidades altas
  - Verificar: `pnpm --filter desktop test security && pnpm verify`

- [ ] **T-603** Desempenho — req: RNF-05, RNF-06 · dep: T-600
  - Critérios:
    - Script de benchmark separa um áudio de 4 min (livre de direitos) em GPU e em CPU e grava os tempos em `docs/PROGRESSO.md`
    - Tempos comparados com a referência do PRD (~2 min GPU, ~10 min CPU); se acima, registrar causa e ajustes feitos (ex.: `--segment`, `-j`)
    - Medição de responsividade: durante a separação, a troca de rota na UI responde em < 200 ms (medido no E2E)
  - Verificar: `pnpm bench`

- [ ] **T-604** Acessibilidade e idioma — req: RNF-07, RNF-08, RNF-09 · dep: T-600
  - Critérios:
    - Todas as telas operáveis só por teclado, com foco visível e rótulos acessíveis nos botões de ícone
    - Auditoria `@axe-core/playwright` sem violações sérias/críticas em todas as telas
    - Contraste do tema escuro ≥ 4,5:1 para textos
    - Teste que varre a UI renderizada e falha se houver textos de interface em inglês fora de uma lista de termos técnicos (MP3, GPU, CPU, FFmpeg, Python)
    - Todas as telas conferidas com estados carregando, vazio e erro
  - Verificar: `pnpm test:e2e a11y && pnpm verify`

## Fase 8 — Entrega

- [ ] **T-900** Instaladores Linux (AppImage e .deb) — req: RNF-01 · dep: T-602, T-603, T-604
  - Critérios:
    - `pnpm dist:linux` (electron-builder) gera AppImage e .deb em `release/`
    - Módulo nativo `better-sqlite3` funciona no app empacotado (pacote incluído e `prebuilds/*.node` desempacotado do asar, DEC-009)
    - Build do web copiado para `resources/renderer` (`extraResources`), que é onde o main o procura quando empacotado
    - AppImage executado nesta máquina: abre, detecta o motor e completa uma separação real
  - Verificar: `pnpm dist:linux` e executar o AppImage gerado

- [ ] **T-901** Instalador Windows (NSIS) — req: RNF-02 · dep: T-900
  - Critérios:
    - `pnpm dist:win` gera instalador NSIS (no Linux via wine ou numa máquina Windows)
    - Caminhos de Python/FFmpeg/venv funcionam no Windows (`Scripts\python.exe`, `.exe`)
    - Instalado num Windows: abre, instala o motor e completa uma separação real
  - Verificar: `pnpm dist:win` e executar o instalador num Windows

- [ ] **T-902** README de execução, testes, build e uso — req: RNF-03, RNF-12 · dep: T-900
  - Critérios:
    - Pré-requisitos (Node, pnpm, Python, FFmpeg, GPU opcional) para Linux e Windows
    - Comandos: dev, verify, e2e, fixtures, bench, dist:linux, dist:win
    - Guia de uso: primeiro uso (instalar motor), separar, histórico, configurações; nota de que é local, sem conta
    - Cada comando do README executado e conferido
  - Verificar: seguir o README do zero num clone limpo

- [ ] **T-999** Auditoria final de cobertura do PRD (/auditar) — req: RF-01, RF-02, RF-03, RF-04, RF-05, RF-06, RF-07, RF-08, RF-09, RF-10, RF-11, RF-12, RF-13, RF-14, RF-15, RF-16, RF-17, RF-18, RF-19, RF-20, RF-21, RF-22, RF-23, RF-24, RF-25, RN-01, RN-02, RN-03, RN-04, RN-05, RN-06, RN-07, RN-08, RN-09, RN-10, RN-11, RN-12, RN-13, RNF-01, RNF-02, RNF-03, RNF-04, RNF-05, RNF-06, RNF-07, RNF-08, RNF-09, RNF-10, RNF-11, RNF-12, RNF-13 · dep: T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-010, T-011, T-100, T-101, T-102, T-103, T-200, T-201, T-300, T-301, T-302, T-303, T-304, T-400, T-401, T-500, T-501, T-600, T-601, T-602, T-603, T-604, T-900, T-901, T-902
  - Critérios:
    - Cada requisito de `REQUISITOS.md` tem evidência (código + teste + verificação) conferida pelo revisor
    - Lacunas viram novas tarefas antes da entrega
  - Verificar: `/auditar`
