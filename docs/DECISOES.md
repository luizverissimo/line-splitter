# Decisões

Decisões técnicas e mudanças de escopo. Mudança de escopo só entra aqui com aprovação explícita do usuário (cite a mensagem dele). Modelo:

```
### DEC-001 — título (AAAA-MM-DD)
- Contexto:
- Decisão:
- Aprovado pelo usuário: sim/não (citação) — obrigatório se reduz ou muda escopo
- Impacto: tarefas/requisitos afetados
```

---

### DEC-001 — Fase 0 adaptada: app desktop local, sem API/banco servidor/mobile (2026-11-20)
- Contexto: o template de Fase 0 do `/planejar` e a stack padrão do CLAUDE.md preveem Fastify, PostgreSQL/Docker, Prisma, Capacitor e autenticação.
- Decisão: seguir o PRD §4 e §8 — Electron + React/Vite + `packages/shared` + SQLite local (`better-sqlite3`). Sem API HTTP, Docker, Prisma, Capacitor, login. O "E2E web → API → banco" vira "UI → IPC → main → SQLite".
- Aprovado pelo usuário: definido no próprio PRD (§4 "prevalece sobre o padrão do CLAUDE.md", §8); usuário recebeu o resumo com esse ponto e rodou `/planejar`. Não reduz o escopo do PRD.
- Impacto: T-001 a T-007.

### DEC-002 — Demucs gera WAV em pasta temporária; FFmpeg codifica o MP3; o app move para a saída (2026-11-20)
- Contexto: PRD exige bitrate configurável, 44,1 kHz estéreo, nomes próprios, sufixo em conflito e nenhum parcial na saída (RN-07, RN-09, RN-13).
- Decisão: Demucs escreve WAV numa pasta temporária; FFmpeg converte para MP3 (`libmp3lame`, `-b:a <bitrate> -ar 44100 -ac 2`); só no fim os dois arquivos são movidos para a pasta de saída.
- Impacto: T-301, T-302.

### DEC-003 — Áudio no renderer via protocolo `media://` com lista permitida (2026-11-20)
- Contexto: renderer em sandbox não lê `file://` nem tem acesso ao fs (RNF-04), mas precisa tocar original e saídas.
- Decisão: protocolo próprio registrado no main que serve só arquivos da lista permitida (entrada atual + saídas registradas), com suporte a Range.
- Impacto: T-011, T-201, T-304, T-400.

### DEC-004 — Instalação do torch: build CUDA quando `nvidia-smi` existe, senão CPU; versões fixadas (2026-11-20)
- Contexto: Demucs 4.x depende de torch/torchaudio; versões novas do torchaudio mudaram o backend de gravação.
- Decisão: escolher o índice do pip (CUDA ou CPU) pela presença de GPU NVIDIA e fixar versões compatíveis com o Demucs (versões em DEC-011).
- Impacto: T-102.

### DEC-005 — Áudio de teste sintético gerado com FFmpeg (2026-11-20)
- Contexto: PRD pede testes com motor real em "áudio curto de teste gerado/licenciado livremente".
- Decisão: fixtures gerados por script com FFmpeg (tons, ruído, percussão sintetizada), git-ignorados. Benchmark de 4 min usa áudio livre de direitos ou gerado. Testes validam o pipeline (2 MP3 válidos, nomes, limites), não a qualidade musical da separação.
- Impacto: T-007, T-301, T-603.

### DEC-006 — Caminho do arquivo arrastado via `webUtils.getPathForFile` (2026-11-20)
- Contexto: com sandbox/contextIsolation, `File.path` não existe no renderer.
- Decisão: preload expõe função que usa `webUtils.getPathForFile`; o main revalida o caminho.
- Impacto: T-201.

### DEC-007 — Windows: instalador pode ser gerado no Linux; verificação exige máquina Windows (2026-11-20)
- Contexto: o desenvolvimento é em Linux; RNF-02 pede instalador NSIS funcional no Windows.
- Decisão: gerar NSIS via electron-builder (wine) no Linux. Se não houver Windows disponível para executar, T-901 fica `[!]` com o bloqueio descrito, sem cortar o requisito.
- Impacto: T-901.

### DEC-008 — Sandbox do Chromium no Electron de desenvolvimento em Linux com AppArmor (2026-11-20)
- Contexto: nesta máquina (Ubuntu com `kernel.apparmor_restrict_unprivileged_userns=1`) o Electron de `node_modules` aborta se `chrome-sandbox` não for SUID root. Corrigir exige `sudo`, que a IA não tem.
- Decisão proposta: `apps/desktop/scripts/sandbox.mjs` detecta a situação e, por padrão, falha mostrando o comando de correção (`sudo chown root:root …/chrome-sandbox && sudo chmod 4755 …`). Só com `LINE_SPLITTER_DEV_NO_SANDBOX=1` os scripts de dev/teste lançam com `--no-sandbox`. As `webPreferences` continuam com `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. O app empacotado não usa essa opção.
- Aprovado pelo usuário: NÃO — pendente. Enquanto o usuário não decidir (rodar o comando de correção ou aprovar o uso de `LINE_SPLITTER_DEV_NO_SANDBOX=1`), as verificações locais da IA usam `--no-sandbox` apenas para executar testes, e isso será informado no relatório.
- Impacto: T-004, T-006 e os E2E; T-900.

### DEC-009 — `better-sqlite3@13` com prebuild N-API nos dois runtimes (2026-11-20)
- Contexto: `better-sqlite3` 12.x é addon V8 compilado e não compila contra o V8 do Electron 45. A 13.x traz prebuilds N-API (`prebuilds/<plataforma>.node`, sem compilação) que carregam tanto no Node do sistema quanto no Electron 45 — conferido em execução nos dois.
- Decisão: usar `better-sqlite3@^13.2`, sem `electron-rebuild`. Os testes do desktop rodam no Node do sistema, junto com os demais. No empacotamento (T-900) o pacote precisa ir junto e `prebuilds/*.node` fora do asar.
- Aprovado pelo usuário: não se aplica — decisão técnica, não muda escopo nem a stack do PRD.
- Impacto: T-005, T-900.

### DEC-010 — Convenção dos E2E: um arquivo por área, filtrado pelo nome (2026-11-20)
- Contexto: `pnpm test:e2e <nome>` repassa o argumento ao Playwright, que filtra pelo nome do arquivo.
- Decisão: cada tarefa cria `e2e/<nome>.spec.ts` com o nome usado no seu `Verificar:` (ex.: `e2e/configuracoes.spec.ts`). Node ≥ 22.5 exigido (leitura do banco nos E2E com `node:sqlite`).
- Aprovado pelo usuário: não se aplica — convenção técnica.
- Impacto: todas as tarefas com `pnpm test:e2e <nome>`.

### DEC-011 — Demucs 4.1.0 com repositório local de modelos (`--repo`) (2026-11-20)
- Contexto: o Demucs 4.1.0 (atual no PyPI) procura modelos primeiro no HuggingFace e cai no repositório AWS legado; com `--repo <pasta>` ele carrega só da pasta local (`LocalRepo` + yaml do modelo), sem rede. O `htdemucs_6s` é um único modelo (`5c90dfd2-34c22ccb.th`, 54.996.327 bytes; o sufixo são os 8 primeiros hex do SHA-256, conferidos pelo próprio Demucs).
- Decisão: o app mantém `userData/engine/models/` com `htdemucs_6s.yaml` (`models: ['5c90dfd2']`) e os pesos baixados por ele mesmo de `https://dl.fbaipublicfiles.com/demucs/hybrid_transformer/5c90dfd2-34c22ccb.th` (T-103, com progresso e checksum). Toda separação roda `python -m demucs -n htdemucs_6s --repo <models>` — nunca baixa nada (RN-12, RNF-11). Pacotes: `demucs==4.1.0`, `numpy>=1.26,<3` (o Demucs 4.1 importa numpy mas não o declara — conferido: sem ele a separação falha) e `torch==2.6.0` (índice CUDA 12.4 se houver GPU NVIDIA, senão CPU), sem torchaudio (o 4.1 usa `sphn` para áudio). Conferido nesta máquina: `torch 2.6.0+cu124`, CUDA na RTX 3050, separação `--two-stems=vocals --repo` de 8 s em ~5 s.
- Aprovado pelo usuário: não se aplica — decisão técnica dentro da stack do PRD (Demucs `htdemucs_6s`).
- Impacto: T-100, T-102, T-103, T-301, T-501.

### DEC-012 — T-300 e T-301 entregues juntas (2026-11-20)
- Contexto: o botão "Separar" da T-300 só tem ação real com o serviço de separação da T-301, que por sua vez depende do mapeamento instrumento → stem da T-300. Entregar uma sem a outra deixaria um botão sem efeito (proibido).
- Decisão: implementar, revisar e commitar T-300 e T-301 no mesmo commit ("T-300, T-301: …"), cada uma com seus critérios conferidos pelo revisor. A tela que mostra o progresso (T-303) e o resultado (T-304) são revisadas nas próprias tarefas.
- Aprovado pelo usuário: não se aplica — não muda escopo nem ordem das fases; só o agrupamento do commit.
- Impacto: T-300, T-301.
