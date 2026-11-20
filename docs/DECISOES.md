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
- Decisão: escolher o índice do pip (CUDA ou CPU) pela presença de GPU NVIDIA e fixar versões compatíveis com o Demucs, registradas aqui quando a T-102 for feita.
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
