# Line Splitter

Aplicativo desktop (Electron) que separa **um instrumento** de uma música e gera **dois MP3**:

- `<música> - <Instrumento>.mp3` — só a linha do instrumento escolhido;
- `<música> - sem <Instrumento>.mp3` — a música com todo o resto, sem o instrumento.

Instrumentos: **Voz, Bateria, Baixo, Guitarra/Violão e Piano/Teclado** (modelo `htdemucs_6s` do [Demucs](https://github.com/facebookresearch/demucs)).

É de uso pessoal e roda **100% no seu computador**: sem conta, sem login, sem nuvem, sem cobrança. A internet só é usada uma vez, para instalar o motor (PyTorch + Demucs) e baixar o modelo (~55 MB). Depois disso funciona offline.

Plataformas: **Linux** (principal) e **Windows**.

---

## Instalar e usar (usuário)

### Pré-requisitos no computador

| | Linux (Ubuntu/Debian) | Windows |
|---|---|---|
| Python 3.9 a 3.13, com `venv` (o PyTorch 2.6 usado pelo motor não tem pacotes para o 3.14) | `sudo apt install python3 python3-venv` | [python.org](https://www.python.org/downloads/) (marque "Add python.exe to PATH") ou `winget install Python.Python.3.12` |
| FFmpeg (com `ffprobe`) | `sudo apt install ffmpeg` | `winget install -e --id Gyan.FFmpeg` |
| GPU (opcional) | NVIDIA com driver instalado (`nvidia-smi` funcionando) | NVIDIA com driver instalado |

Sem GPU NVIDIA o app usa a CPU (mais lento). Referência medida em 2026-11 com `pnpm bench` numa RTX 3050 6 GB / CPU de 16 threads: 4 min de música em ~19 s na GPU e ~67 s na CPU. Se o Python ou o FFmpeg não estiverem no PATH, informe o caminho em **Configurações**.

### Instaladores

Gerados em `release/` (veja [Gerar os instaladores](#gerar-os-instaladores)).

**Linux — .deb (recomendado, inclusive no Ubuntu 24.04+):**

```bash
sudo apt install ./release/line-splitter_0.1.0_amd64.deb
line-splitter    # ou procure "Line Splitter" no menu de aplicativos
```

O .deb já declara `ffmpeg`, `python3` e `python3-venv` como dependências e registra um perfil do AppArmor para o sandbox do Chromium.

**Linux — AppImage:**

```bash
chmod +x release/Line-Splitter-0.1.0-x86_64.AppImage
./release/Line-Splitter-0.1.0-x86_64.AppImage
```

No Ubuntu 24.04+ há dois obstáculos conhecidos do formato AppImage (DEC-015):

1. **FUSE:** o AppImage precisa de `libfuse2`. Instale com `sudo apt install libfuse2t64`, ou rode sem FUSE com `APPIMAGE_EXTRACT_AND_RUN=1 ./release/Line-Splitter-0.1.0-x86_64.AppImage`.
2. **Sandbox:** o AppArmor bloqueia os user namespaces que o sandbox do Chromium usa, e dentro do AppImage o `chrome-sandbox` não pode ser SUID. O app **não** desliga o sandbox sozinho. Libere criando um perfil do AppArmor para o caminho do AppImage (troque o caminho pelo seu):

   ```bash
   APPIMAGE="$HOME/Aplicativos/Line-Splitter-0.1.0-x86_64.AppImage"
   sudo tee /etc/apparmor.d/line-splitter-appimage >/dev/null <<PERFIL
   abi <abi/4.0>,
   include <tunables/global>
   profile line-splitter-appimage "$APPIMAGE" flags=(unconfined) {
     userns,
   }
   PERFIL
   sudo apparmor_parser -r /etc/apparmor.d/line-splitter-appimage
   ```

   Se preferir não mexer no AppArmor, use o .deb.

**Windows:** gere o instalador com `pnpm dist:win` (numa máquina Windows, ou no Linux com `wine`), rode `Line-Splitter-Setup-0.1.0.exe` e siga o instalador (dá para escolher a pasta); o app fica no menu Iniciar como "Line Splitter". **Atenção:** o instalador Windows é gerado (também no Linux, com `wine`), mas ainda não foi testado num Windows real (tarefa T-901).

### Primeiro uso: instalar o motor

1. Ao abrir pela primeira vez, o app vai para a tela **Motor** e mostra o que falta (Python, FFmpeg, Demucs, modelo).
2. Clique em **Instalar motor**. O app cria um ambiente Python só dele (na pasta de dados do app) e instala o PyTorch — com CUDA se houver GPU NVIDIA, senão a versão de CPU — e o Demucs. São alguns GB; o progresso e o log aparecem na tela, e dá para cancelar.
3. Clique em **Baixar modelo** (~55 MB, com verificação de integridade).
4. Quando aparecer **"Tudo pronto para separar."**, vá para **Início**.

### Separar um instrumento

1. Em **Início**, clique em **Escolher arquivo** ou arraste o arquivo para a janela. Formatos: MP3, WAV, FLAC, M4A, AAC e OGG, até 500 MB e 30 minutos.
2. Escolha o instrumento e clique em **Separar**. A tela mostra o progresso e o tempo decorrido; dá para trocar de tela durante a separação ou **Cancelar** (nada é gravado).
3. No resultado, ouça as duas faixas nos players, use **Mostrar arquivo** / **Abrir pasta**, **Separar outro instrumento** (mesmo arquivo) ou **Novo arquivo**.

Os MP3 vão para a **pasta de saída** (padrão: `<sua pasta de Música>/Line Splitter`). Se já existir um arquivo com o mesmo nome, o novo ganha um sufixo `(2)`, `(3)`…

### Histórico

A tela **Histórico** lista as separações feitas: arquivo de origem e instrumento, data, duração do áudio, tempo de processamento, dispositivo (GPU/CPU) e qualidade, com um player para cada faixa e **Abrir pasta**. **Remover** tira a separação do histórico; marque **Apagar também os arquivos MP3** para apagar as duas faixas do disco (o arquivo original nunca é apagado). Faixas apagadas fora do app aparecem como "Arquivo não encontrado".

### Configurações

- **Pasta de saída** dos MP3.
- **Qualidade do MP3**: 192, 256 ou 320 kbps (padrão 320).
- **Dispositivo de processamento**: automático (GPU se houver), GPU ou CPU.
- **Caminho do Python** e **do FFmpeg**, se não estiverem no PATH.

Tudo fica num banco SQLite local, na pasta de dados do app (Linux: `~/.config/Line Splitter`; Windows: `%APPDATA%\Line Splitter`), junto com o motor instalado.

---

## Desenvolvimento

### Pré-requisitos

- **Node.js 22.5+** e **pnpm 10** (`npm install -g pnpm@10`; nos Node.js até a 24 também dá para usar `corepack enable`).
- Python 3.9 a 3.13 com `venv` e FFmpeg (como acima) — os testes usam o motor e o FFmpeg reais.
- Linux: no Ubuntu 24.04+ o Electron de `node_modules` precisa do sandbox do Chromium. Rode uma vez o comando que `pnpm dev` mostra (`sudo chown root:root …/chrome-sandbox && sudo chmod 4755 …/chrome-sandbox`) ou, só em desenvolvimento, defina `LINE_SPLITTER_DEV_NO_SANDBOX=1` (DEC-008).

```bash
pnpm install
```

### Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev` | Vite com recarga + Electron apontando para ele |
| `pnpm verify` | typecheck + lint + Prettier + testes (Vitest) + varredura anti-mock — o portão de toda tarefa |
| `pnpm test` | Só os testes Vitest (unidade e integração, com Demucs e FFmpeg reais num trecho curto) |
| `pnpm test:e2e` | Builda o desktop e roda os E2E com Playwright no Electron (`pnpm test:e2e envio` filtra por arquivo) |
| `pnpm fixtures` | Gera os áudios de teste em `fixtures/` com o FFmpeg (os testes também geram sozinhos) |
| `pnpm bench` | Benchmark: separa 4 min de áudio na CPU e, se houver GPU NVIDIA, também na GPU; imprime os tempos e grava `fixtures/benchmark.md` |
| `pnpm dist:linux` | Gera AppImage e .deb em `release/` |
| `pnpm smoke:linux` | Executa o AppImage gerado e faz uma separação real (teste de fumaça do pacote) |
| `pnpm dist:win` | Gera o instalador NSIS em `release/` (numa máquina Windows, ou no Linux com `wine`) |

Na primeira execução, os testes de integração e os E2E instalam um motor de teste (CPU) em `/tmp/line-splitter-e2e-engine` — demora alguns minutos e exige internet uma vez. Com GPU NVIDIA, o `pnpm bench` instala ainda um segundo motor, com CUDA (alguns GB), em `/tmp/line-splitter-bench-engine-cuda`; sem GPU a medição da GPU é pulada.

### Gerar os instaladores

```bash
pnpm dist:linux      # release/Line-Splitter-<versão>-x86_64.AppImage e release/line-splitter_<versão>_amd64.deb
pnpm smoke:linux     # confere o AppImage gerado (no Ubuntu 24.04+: LINE_SPLITTER_DEV_NO_SANDBOX=1)
pnpm dist:win        # release/Line-Splitter-Setup-<versão>.exe
```

`pnpm dist:win` precisa de Windows ou de `wine` no Linux (`sudo apt install wine`).

### Variáveis de ambiente

Todas opcionais; veja `.env.example`. As principais são `LINE_SPLITTER_USER_DATA` (pasta de dados alternativa) e `LINE_SPLITTER_MUSIC_DIR` (pasta de Música alternativa), usadas pelos testes para isolar banco, motor e saída, e `LINE_SPLITTER_DEV_NO_SANDBOX` (DEC-008).

### Estrutura

```
apps/desktop      Electron: processo principal (motor, separação, SQLite, IPC) e preload
apps/web          Interface React + Vite (renderer)
packages/shared   Schemas Zod e contrato IPC usados pelos dois lados
e2e/              E2E Playwright do app        e2e-pacote/  teste de fumaça do pacote
scripts/          dev, fixtures, ícones        docs/        PRD, requisitos, tarefas, decisões
```

O projeto foi construído com Claude Code a partir de `docs/PRD.md`; o fluxo está descrito em [`docs/FLUXO-IA.md`](docs/FLUXO-IA.md).
