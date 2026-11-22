# Requisitos extraídos do PRD

Gerado por `/planejar`. Tudo que o PRD menciona vira uma linha aqui. IDs: `RF-xx` funcional · `RN-xx` regra de negócio · `RNF-xx` não funcional (plataformas, segurança, desempenho, offline…).

| ID | Requisito | Origem no PRD | Tarefas | Status |
|---|---|---|---|---|
| RF-01 | Ao abrir, verificar se o motor está pronto: Python (3.10 a 3.13, DEC-017), separador no ambiente do app, FFmpeg e pesos dos modelos de separação (DEC-017; antes `htdemucs_6s`) | §5.1 "Ao abrir, o app verifica…" | T-100 | feito |
| RF-02 | Tela de configuração do motor com status ✔/✖ de cada item | §5.1 "tela de configuração com o status de cada item" | T-101, T-601 | feito |
| RF-03 | Botão "Instalar motor": cria venv gerenciado em `userData/engine` e instala `demucs` + `torch` via pip, com log ao vivo | §5.1 "Botão Instalar motor" | T-102 | feito |
| RF-04 | Download dos pesos do modelo com barra de progresso | §5.1 "Download dos pesos do modelo" | T-103 | feito |
| RF-05 | Sem Python/FFmpeg no sistema: mensagem com instruções para Linux e Windows e botão "Verificar de novo" | §5.1 "Se Python ou FFmpeg não existirem…" | T-101, T-601 | feito |
| RF-06 | Detectar GPU (CUDA) e usar quando disponível, senão CPU; mostrar qual está em uso | §5.1 "Detecta GPU (CUDA)…" | T-100, T-101 | feito |
| RF-07 | Enviar áudio arrastando e soltando o arquivo na janela | §5.2 "Arrastar e soltar" | T-201, T-600 | feito |
| RF-08 | Enviar áudio pelo botão "Escolher arquivo" (diálogo nativo) | §5.2 "botão Escolher arquivo" | T-201, T-600 | feito |
| RF-09 | Após carregar, mostrar nome, duração, formato e player do original | §5.2 "Após carregar, mostra nome, duração…" | T-201, T-600 | feito |
| RF-10 | Pedir a escolha do instrumento: seleção única, cartões com ícone (Voz, Bateria, Baixo, Guitarra/Violão, Piano/Teclado) | §5.3 | T-300, T-600 | feito |
| RF-11 | Separar o instrumento escolhido gerando instrumento e "resto" (originalmente Demucs `htdemucs_6s --two-stems`; desde a DEC-017, o melhor modelo por instrumento via audio-separator, com resto = mix − instrumento) | §5.4 "Executa o Demucs no modo de duas faixas" | T-301, T-905 | feito |
| RF-12 | Barra de progresso real (lida da saída do separador) e tempo decorrido | §5.4 "Barra de progresso real" | T-303, T-600, T-905 | feito |
| RF-13 | Botão "Cancelar": encerra o processo filho e apaga arquivos parciais | §5.4 "Botão Cancelar" | T-302, T-303, T-601 | feito |
| RF-14 | Erros do motor (memória, arquivo inválido, processo encerrado) em mensagem legível, com opção de ver o log técnico | §5.4 "Erros do motor…" | T-302, T-303, T-601 | feito |
| RF-15 | Gerar dois MP3: `<nome> - <Instrumento>.mp3` e `<nome> - sem <Instrumento>.mp3` | §1, §5.5 "Nomes dos arquivos" | T-301, T-304, T-600 | feito |
| RF-16 | Tela de resultado com player para cada faixa (play/pause, barra de posição, volume) | §5.5 "Player para cada uma das duas faixas" | T-011, T-304, T-600 | feito |
| RF-17 | Botões "Abrir pasta" e "Mostrar arquivo" no gerenciador de arquivos do sistema | §5.5 | T-304, T-600 | feito |
| RF-18 | Botões "Separar outro instrumento" (mesmo arquivo) e "Novo arquivo" | §5.5 | T-304, T-600 | feito |
| RF-19 | Histórico: lista com data, arquivo original, instrumento, duração do processamento e caminhos das saídas | §5.6 | T-301, T-400, T-600 | feito |
| RF-20 | Ações do histórico: ouvir as faixas e abrir pasta | §5.6 "Ações por item" | T-400, T-600 | feito |
| RF-21 | Remover item do histórico com opção de também apagar os MP3 | §5.6 "remover do histórico (opção de também apagar os MP3)" | T-401, T-600 | feito |
| RF-22 | Item do histórico indica "arquivo não encontrado" se os arquivos foram movidos/apagados | §5.6 | T-400, T-600 | feito |
| RF-23 | Estado vazio do histórico convidando à primeira separação | §5.6 "Estado vazio" | T-400, T-600 | feito |
| RF-24 | Configurações: pasta de saída, bitrate, dispositivo (Auto/GPU/CPU), caminhos de Python e FFmpeg, reinstalar motor | §5.1 "Caminhos… podem ser sobrescritos", §5.7 | T-010, T-100, T-102 | feito |
| RF-25 | Persistir histórico e preferências em SQLite (`better-sqlite3`) em `userData` | §4 "Persistência local", §5.7 "Persistidas no SQLite" | T-005, T-010 | feito |
| RF-26 | Separação com o melhor modelo por instrumento, escolhido por medição (DEC-017): MelBand-RoFormer Kim FT2 Bleedless para voz e BS-Roformer-SW para bateria, baixo, guitarra e piano, com vazamento menor que o `htdemucs_6s` | DEC-017 (pedido do usuário em 2026-11-21) | T-903, T-904, T-905, T-906 | pendente |
| RF-27 | Baixar em MP3 cada faixa gerada (só o instrumento/voz e sem o instrumento/voz) pelo diálogo "Salvar como", no resultado e no histórico | Pedido do usuário em 2026-11-22 (DEC-018) | T-907 | pendente |
| RN-01 | Formatos aceitos: MP3, WAV, FLAC, M4A/AAC, OGG | §5.2 "Formatos aceitos" | T-200, T-201 | feito |
| RN-02 | Limites: até 500 MB e até 30 minutos | §5.2 "Limites" | T-200, T-601 | feito |
| RN-03 | Validar extensão, legibilidade pelo FFmpeg e duração, com erro claro se inválido | §5.2 "Validação" | T-200, T-201, T-601 | feito |
| RN-04 | Mapeamento instrumento → stem: Voz=vocals, Bateria=drums, Baixo=bass, Guitarra/Violão=guitar, Piano/Teclado=piano | §5.3 tabela | T-300 | feito |
| RN-05 | Botão "Separar" só habilitado com um instrumento escolhido | §5.3 | T-300 | feito |
| RN-06 | Uma separação por vez | §5.4 | T-301 | feito |
| RN-07 | MP3 320 kbps por padrão (opções 192/256/320), 44,1 kHz, estéreo | §5.5 "Saída em MP3" | T-010, T-301 | feito |
| RN-08 | Pasta de saída padrão `~/Música/Line Splitter` (equivalente no Windows), alterável | §5.5 "Pasta de saída" | T-010 | feito |
| RN-09 | Nome repetido na saída ganha sufixo ` (2)`, ` (3)`… | §5.5 | T-301 | feito |
| RN-10 | Toda separação gera exatamente dois arquivos | §6 | T-301 | feito |
| RN-11 | O arquivo original nunca é modificado nem movido | §6 | T-201, T-301 | feito |
| RN-12 | Nenhum áudio sai do computador; rede só para instalar motor/modelo | §6 | T-102, T-103, T-501 | feito |
| RN-13 | Separação cancelada/com erro não deixa parciais na saída nem entra como concluída no histórico | §6 | T-302, T-601 | feito |
| RNF-01 | Linux como plataforma principal, instaladores AppImage e .deb | §3, §7 | T-500, T-900 | feito |
| RNF-02 | Windows com instalador NSIS | §3, §7 | T-901 | pendente |
| RNF-03 | Monorepo pnpm, TS strict, Electron + React/Vite, `packages/shared` com Zod e tipos IPC | §4 | T-001, T-002, T-902 | pendente |
| RNF-04 | Segurança Electron: contextIsolation, sem nodeIntegration, sandbox, CSP restritiva, IPC validado com Zod, renderer sem acesso direto ao fs | §4, §7 | T-002, T-004, T-011, T-602 | feito |
| RNF-05 | UI não trava durante o processamento | §5.4 | T-303, T-603 | feito |
| RNF-06 | Desempenho de referência: música de 4 min em ~2 min com GPU e ~10 min em CPU | §7 | T-603 | feito |
| RNF-07 | Estados de carregando, vazio e erro em todas as telas | §7 | T-003, T-011, T-604 | feito |
| RNF-08 | Tema escuro | §7 | T-003, T-604 | feito |
| RNF-09 | Interface em português | §7 | T-003, T-500, T-604 | feito |
| RNF-10 | Testes de integração com Demucs e FFmpeg reais em áudio curto livre (sem mock do motor) | §4, §7 | T-007, T-301 | feito |
| RNF-11 | Funciona offline após a configuração inicial | §2 | T-103, T-501 | feito |
| RNF-12 | Usuário único: sem login, sem nuvem, sem cobrança | §2 | T-004, T-902 | pendente |
| RNF-13 | Testes E2E com Playwright para Electron | §4 | T-006, T-600 | feito |
