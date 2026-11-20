# PRD — Line Splitter

Aplicativo desktop (Electron), de uso pessoal, que separa um instrumento de uma música, no estilo do lalal.ai — mas rodando **100% local**, sem servidor e sem conta.

## 1. Objetivo

O usuário escolhe um arquivo de áudio e o instrumento que quer isolar. O app gera **dois arquivos MP3**:

1. **Faixa do instrumento** — só a linha do instrumento escolhido.
2. **Faixa sem o instrumento** — a música com todos os outros sons, menos o instrumento escolhido.

## 2. Usuário e contexto

- Um único usuário (o dono do computador). Sem login, sem nuvem, sem cobrança.
- Uso típico: músico que quer tirar a voz para cantar por cima, tirar o baixo para tocar junto, estudar a linha de bateria etc.
- Roda offline depois da configuração inicial (o download do modelo exige internet uma vez).

## 3. Plataformas

- **Linux** (plataforma principal, é onde o usuário desenvolve) e **Windows**.
- Empacotado como instalador: AppImage/.deb no Linux, instalador NSIS no Windows.
- macOS e mobile não fazem parte deste produto.

## 4. Stack (prevalece sobre o padrão do CLAUDE.md)

Este é um app desktop local. **Não há** API HTTP, Fastify, Prisma, PostgreSQL, autenticação, `apps/mobile` nem web pública.

- Monorepo pnpm, TypeScript `strict`.
- `apps/desktop` — Electron (processo principal + preload seguro com `contextIsolation: true`, sem `nodeIntegration`). Comunicação renderer ↔ main só por IPC tipado exposto no preload.
- `apps/web` — UI em React + Vite (renderer do Electron).
- `packages/shared` — schemas Zod e tipos dos canais IPC (validação dos dois lados).
- **Motor de separação:** [Demucs](https://github.com/facebookresearch/demucs) (modelo `htdemucs_6s`, open source, MIT), executado como processo filho Python pelo processo principal.
- **FFmpeg** para decodificar entradas e codificar MP3.
- Persistência local (histórico e preferências): SQLite via `better-sqlite3` na pasta de dados do usuário (`app.getPath('userData')`).
- Testes: Vitest (unidade/integração com Demucs e FFmpeg reais em um trecho curto de áudio) e Playwright para Electron (E2E).

## 5. Funcionalidades

### 5.1 Configuração do motor (primeiro uso)

- Ao abrir, o app verifica se o motor está pronto: Python ≥ 3.9, pacote `demucs`, FFmpeg e pesos do modelo `htdemucs_6s`.
- Se faltar algo, mostra uma tela de configuração com o status de cada item (✔ / ✖) e:
  - Botão **"Instalar motor"**: cria um ambiente virtual Python gerenciado pelo app (em `userData/engine`) e instala o `demucs` (e o `torch` adequado) via `pip`, mostrando o log ao vivo.
  - Download dos pesos do modelo com barra de progresso.
  - Se Python ou FFmpeg não existirem no sistema, mensagem clara com instruções de instalação para Linux e Windows e botão "Verificar de novo".
- Detecta GPU (CUDA) e usa quando disponível; caso contrário usa CPU. Mostra qual está em uso.
- Caminhos de Python e FFmpeg podem ser sobrescritos nas Configurações.

### 5.2 Enviar áudio

- Arrastar e soltar o arquivo na janela **ou** botão "Escolher arquivo" (diálogo nativo).
- Formatos aceitos: MP3, WAV, FLAC, M4A/AAC, OGG.
- Limites: até 500 MB e até 30 minutos de duração.
- Validação: extensão, arquivo legível pelo FFmpeg, duração dentro do limite. Erro claro se inválido (ex.: "Arquivo corrompido ou formato não suportado").
- Após carregar, mostra nome, duração, formato e um player para ouvir o original.

### 5.3 Escolher o instrumento

Depois de enviar o arquivo, o app **pede para escolher** o instrumento a separar (seleção única, cartões com ícone):

| Opção na tela | Stem do Demucs |
|---|---|
| Voz | `vocals` |
| Bateria | `drums` |
| Baixo | `bass` |
| Guitarra/Violão | `guitar` |
| Piano/Teclado | `piano` |

O botão **"Separar"** só fica habilitado com um instrumento escolhido.

### 5.4 Separação

- Executa o Demucs no modo de duas faixas (`--two-stems=<stem>`, modelo `htdemucs_6s`), gerando o instrumento e o "resto".
- Barra de progresso real (porcentagem lida da saída do Demucs) e tempo decorrido.
- Botão **"Cancelar"**: encerra o processo filho e apaga arquivos parciais.
- Uma separação por vez; a UI não trava durante o processamento.
- Erros do motor (falta de memória, arquivo inválido, processo encerrado) aparecem em mensagem legível, com opção de ver o log técnico.

### 5.5 Resultado: dois MP3

- Saída em MP3, 320 kbps por padrão (opções 192/256/320 nas Configurações), 44,1 kHz, estéreo.
- Nomes dos arquivos:
  - `<nome original> - <Instrumento>.mp3` (ex.: `Minha Música - Voz.mp3`)
  - `<nome original> - sem <Instrumento>.mp3` (ex.: `Minha Música - sem Voz.mp3`)
- Pasta de saída: padrão `~/Música/Line Splitter` (ou equivalente no Windows); alterável nas Configurações. Se já existir arquivo com o mesmo nome, acrescenta sufixo ` (2)`, ` (3)`…
- Tela de resultado com:
  - Player para cada uma das duas faixas (play/pause, barra de posição, volume).
  - Botões "Abrir pasta" e "Mostrar arquivo" (abre o gerenciador de arquivos do sistema).
  - Botão "Separar outro instrumento" (reaproveita o mesmo arquivo) e "Novo arquivo".

### 5.6 Histórico

- Lista das separações feitas: data, arquivo original, instrumento, duração do processamento, caminhos das saídas.
- Ações por item: ouvir as faixas, abrir pasta, remover do histórico (opção de também apagar os MP3).
- Se os arquivos foram movidos/apagados fora do app, o item indica "arquivo não encontrado".
- Estado vazio: mensagem convidando a fazer a primeira separação.

### 5.7 Configurações

- Pasta de saída, bitrate do MP3, dispositivo (Auto/GPU/CPU), caminhos de Python e FFmpeg, botão para reinstalar o motor.
- Persistidas no SQLite local.

## 6. Regras de negócio

- RN: sempre gerar exatamente dois arquivos por separação (instrumento + sem instrumento).
- RN: o arquivo original nunca é modificado nem movido.
- RN: nenhum áudio sai do computador — nenhuma chamada de rede além da instalação do motor/modelo.
- RN: uma separação cancelada ou com erro não deixa arquivos parciais na pasta de saída nem entra no histórico como concluída.

## 7. Requisitos não funcionais

- Segurança Electron: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` no renderer, CSP restritiva, canais IPC validados com Zod; o renderer não recebe acesso direto ao sistema de arquivos.
- Desempenho: música de 4 min separa em até ~2 min com GPU e até ~10 min em CPU moderna (referência, não bloqueio).
- UI: estados de carregando, vazio e erro em todas as telas; tema escuro; interface em português.
- Testes de integração usam Demucs e FFmpeg reais com um áudio curto de teste gerado/licenciado livremente (sem mocks do motor).
- Empacotamento com electron-builder para Linux (AppImage, .deb) e Windows (NSIS).

## 8. Fora deste produto

Contas, nuvem, pagamentos, edição de áudio (cortes, mixagem), separação em lote de vários arquivos, mais de um instrumento por vez, macOS/mobile.
