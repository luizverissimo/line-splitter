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

### DEC-013 — Rótulo do instrumento nos nomes dos MP3 (2026-11-20)
- Contexto: PRD §5.5/RF-15 pede `<nome> - <Instrumento>.mp3`, mas "Guitarra/Violão" e "Piano/Teclado" têm "/", proibido em nomes de arquivo (Linux e Windows).
- Decisão: nos nomes de arquivo a barra vira hífen: "Guitarra-Violão" e "Piano-Teclado" (ex.: `Música - sem Guitarra-Violão.mp3`). Voz, Bateria e Baixo ficam iguais ao rótulo da tela.
- Aprovado pelo usuário: não se aplica — adaptação técnica do mesmo nome, sem mudar escopo.
- Impacto: T-300, T-301, T-304.

### DEC-014 — T-400 e T-401 entregues juntas (2026-11-20)
- Contexto: a remoção (T-401) é uma ação de cada item da lista (T-400), na mesma tela e no mesmo conjunto de canais (`history:list`/`history:remove`).
- Decisão: implementar, revisar (veredito separado por tarefa) e commitar as duas juntas ("T-400, T-401: …").
- Aprovado pelo usuário: não se aplica — só o agrupamento do commit, sem mudar escopo nem ordem das fases.
- Impacto: T-400, T-401.

### DEC-015 — Empacotamento Linux: AppImage, .deb e sandbox (2026-11-20)
- Contexto: `electron-builder` 26 gera AppImage e .deb em `release/`. No Ubuntu 24.04+ (AppArmor restringindo user namespaces) o Chromium precisa de `chrome-sandbox` SUID root ou de um perfil do AppArmor com `userns`. O `postinst` do .deb instala um perfil do AppArmor com `userns` (`/etc/apparmor.d/line-splitter`) e só torna `chrome-sandbox` SUID (4755) quando o kernel não oferece user namespaces. O AppImage não consegue: roda de uma montagem FUSE/extração em `/tmp`, onde nada é SUID. Além disso, o Ubuntu 24.04 não traz `libfuse2`, que o AppImage usa para se montar.
- Decisão: o app empacotado **não** liga `--no-sandbox` sozinho. O instalador recomendado no Ubuntu 24.04+ é o .deb. Para o AppImage nesses sistemas, o README (T-902) vai documentar as opções do usuário (instalar `libfuse2t64` ou usar `APPIMAGE_EXTRACT_AND_RUN=1`; e criar um perfil do AppArmor com `userns` para o caminho do AppImage, com sudo). O teste de fumaça do pacote (`pnpm smoke:linux`) roda o AppImage gerado com `APPIMAGE_EXTRACT_AND_RUN=1` e, nesta máquina, com `--no-sandbox` só se `LINE_SPLITTER_DEV_NO_SANDBOX=1` (mesma regra do DEC-008, ainda pendente).
- `@line-splitter/shared` e `zod` passaram a `devDependencies` do desktop: o esbuild já os embute em `out/main.cjs`, então não precisam ir para o pacote. Só `better-sqlite3` vai, com `prebuilds/` fora do asar (DEC-009); `deps/`, `src/` e `build/` do módulo ficam de fora.
- Aprovado pelo usuário: não se aplica — decisão técnica de empacotamento, sem mudança de escopo. A parte de rodar com `--no-sandbox` depende do DEC-008, pendente.
- Impacto: T-900, T-902.

### DEC-016 — Busca de executáveis no PATH: por nome, depois por pasta (2026-11-21)
- Contexto: para o Windows (T-901a) a detecção do Python passou a testar todos os candidatos do PATH em ordem até um funcionar (`python`, depois o lançador `py`), ignorando o atalho da Microsoft Store (`…\Microsoft\WindowsApps`).
- Decisão: a ordem é por nome e depois por pasta — o primeiro nome da lista vence em qualquer pasta do PATH. Isso também vale no Linux/macOS: um `python3` em qualquer pasta do PATH vence um `python` numa pasta anterior (antes, a primeira pasta vencia). É o comportamento desejado: `python3` é sempre o Python 3 do sistema, enquanto `python` pode ser outro interpretador. Se um candidato não executa ou é antigo demais, o próximo é testado.
- Aprovado pelo usuário: não se aplica — decisão técnica, sem mudança de escopo.
- Impacto: T-901a.

### DEC-017 — Qualidade da separação: melhor modelo por instrumento (2026-11-21)
- Contexto: o usuário relatou que, na faixa do instrumento, ainda dá para ouvir o resto da música baixinho e pediu isolamento como o do lalal.ai. O PRD fixa o Demucs `htdemucs_6s`, o único que separa guitarra e piano, porém o mais fraco nos demais instrumentos. Nenhum separador zera o vazamento; modelos mais novos reduzem bastante.
- Opções apresentadas: (1) melhor modelo por instrumento; (2) só Demucs em alta qualidade (`htdemucs_ft` + `--shifts`); (3) escolha Rápida/Máxima nas Configurações.
- Decisão: opção (1). Voz com um modelo da família RoFormer (BS-/MelBand-RoFormer); Bateria e Baixo com o Demucs `htdemucs_ft`; Guitarra/Violão e Piano/Teclado com o `htdemucs_6s` em alta qualidade (`--shifts` e mais sobreposição). Os modelos exatos e os parâmetros são escolhidos por medição de vazamento (T-903), com áudio sintético e uma música real indicada pelo usuário. Custos aceitos: separação de 2 a 4 vezes mais lenta e cerca de 1 GB a mais de modelos para baixar.
- Muda o PRD em §4/§5 (motor fixo `htdemucs_6s`) — prevalece esta decisão; o restante do PRD (dois MP3, offline após a configuração, cancelamento, progresso real, histórico) continua valendo.
- Medição (T-903): `pnpm quality --song <My Way, Frank Sinatra>`, GPU RTX 3050 6 GB, 2026-11-22 (execução final, com o código deste commit). Resultado gravado em `fixtures/quality.md` (fora do git) e reproduzido aqui:

| Instrumento | Separador | Vazamento | Vazamento no resto | Na pausa | Erro tocando | SDR | Trechos |
|---|---|---|---|---|---|---|---|
| Voz (MUSDB) | htdemucs_6s | -21,1 (-15,8) | -23,6 (-12,0) | -49,7 (-20,2) | -10,3 (-4,9) | 9,4 (4,4) | 12 |
| Voz (MUSDB) | htdemucs_6s_shifts | -21,2 (-15,7) | -23,6 (-12,2) | -49,7 (-20,2) | -10,6 (-4,8) | 9,6 (4,6) | 12 |
| Voz (MUSDB) | htdemucs_ft | -21,9 (-16,5) | -24,9 (-12,0) | -52,3 (-20,1) | -10,8 (-4,9) | 9,6 (4,8) | 12 |
| Voz (MUSDB) | bs_roformer_sw | -26,2 (-19,3) | -30,3 (-14,0) | -74,9 (-50,1) | -12,8 (-7,3) | 11,9 (7,5) | 12 |
| Voz (MUSDB) | melband_kim_ft2_bleedless | -29,5 (-19,2) | -29,7 (-13,4) | -78,0 (-56,3) | -13,2 (-6,6) | 12,8 (5,9) | 12 |
| Voz (MUSDB) | bs_roformer_1297 | -31,4 (-20,8) | -33,1 (-14,0) | -51,6 (-15,8) | -13,9 (-8,3) | 13,3 (8,2) | 12 |
| Bateria (MUSDB) | htdemucs_6s | -20,3 (-15,2) | -21,8 (-13,9) | -45,4 (-13,8) | -7,7 (-4,0) | 8,3 (5,4) | 12 |
| Bateria (MUSDB) | htdemucs_6s_shifts | -20,4 (-15,3) | -22,0 (-14,2) | -47,3 (-13,4) | -7,7 (-3,2) | 8,4 (5,6) | 12 |
| Bateria (MUSDB) | htdemucs_ft | -23,1 (-1,3) | -22,4 (-16,1) | -40,7 (-5,3) | -8,5 (2,3) | 8,3 (-2,9) | 12 |
| Bateria (MUSDB) | bs_roformer_sw | -24,3 (-16,5) | -25,3 (-18,3) | -64,4 (-13,7) | -10,4 (-5,1) | 10,6 (5,2) | 12 |
| Baixo (MUSDB) | htdemucs_6s | -21,3 (-5,5) | -25,1 (-16,9) | -41,8 (-3,7) | -4,7 (0,2) | 6,7 (-0,5) | 12 |
| Baixo (MUSDB) | htdemucs_6s_shifts | -21,5 (-5,1) | -25,3 (-17,2) | -41,8 (-3,7) | -5,0 (0,1) | 6,7 (-0,5) | 12 |
| Baixo (MUSDB) | htdemucs_ft | -24,8 (-6,9) | -28,9 (-17,5) | -36,4 (-4,3) | -6,0 (-0,4) | 8,9 (-0,5) | 12 |
| Baixo (MUSDB) | bs_roformer_sw | -24,8 (-4,2) | -27,1 (-17,9) | -60,1 (-3,6) | -7,6 (-1,7) | 7,9 (0,9) | 12 |
| Guitarra (BabySlakh) | htdemucs_6s | -5,4 (29,1) | -7,5 (-2,9) | -19,9 (-9,8) | -0,9 (0,9) | 0,9 (-1,2) | 12 |
| Guitarra (BabySlakh) | htdemucs_6s_shifts | -3,8 (25,2) | -8,0 (-2,9) | -25,0 (-10,8) | -1,3 (0,7) | 1,0 (-1,5) | 12 |
| Guitarra (BabySlakh) | bs_roformer_sw | -20,1 (18,3) | -14,7 (-3,0) | -80,9 (-10,8) | -5,7 (0,0) | 5,1 (-0,0) | 12 |
| Piano (BabySlakh) | htdemucs_6s | -4,0 (20,6) | -6,8 (-0,7) | -43,5 (-7,8) | -0,0 (0,0) | 0,5 (-0,0) | 12 |
| Piano (BabySlakh) | htdemucs_6s_shifts | -2,3 (32,1) | -5,7 (0,4) | -40,8 (-8,6) | -0,2 (0,0) | 0,3 (-0,0) | 12 |
| Piano (BabySlakh) | bs_roformer_sw | -17,3 (-10,1) | -27,7 (-2,3) | -66,5 (-14,2) | -7,8 (-0,8) | 6,2 (0,9) | 12 |

| Separador | Tempo (s de processamento por s de áudio) |
|---|---|
| htdemucs_6s | 0,2 |
| htdemucs_6s_shifts | 0,4 |
| htdemucs_ft | 0,5 |
| bs_roformer_sw | 0,4 |
| melband_kim_ft2_bleedless | 0,9 |
| bs_roformer_1297 | 1,1 |

**Música real: My Way (2008 Remastered) - Frank Sinatra.mp3**

Nível de cada faixa nos trechos em que todos os separadores concordam que o instrumento está ausente
(dB relativos ao mix; menor é melhor). Faixas para ouvir em `fixtures/quality/musica/`.

| Instrumento | Trechos ausentes (0,5 s) | htdemucs_6s | htdemucs_6s_shifts | htdemucs_ft | bs_roformer_sw | melband_kim_ft2_bleedless | bs_roformer_1297 |
|---|---|---|---|---|---|---|---|
| Voz | 145 de 552 | -47,2 | -47,7 | -50,6 | -40,9 | -44,8 | -37,6 |
| Bateria | 269 de 552 | -31,3 | -30,5 | -28,1 | -27,7 | — | — |
| Baixo | 11 de 552 | -25,1 | -24,7 | -22,6 | -26,4 | — | — |
| Guitarra | 40 de 552 | -36,4 | -34,7 | — | -152,7 | — | — |
| Piano | 529 de 552 | -64,8 | -65,7 | — | -157,9 | — | — |

- Leitura dos números:
  - Voz: o Kim FT2 Bleedless reduz o vazamento de −21,1 para −29,5 dB e, nas pausas do canto, de −49,7 para −78,0 dB (pior trecho −20,2 → −56,3). O BS-RoFormer 1297 tem o melhor vazamento geral (−31,4), mas nas pausas fica igual ao atual (−51,6 contra −49,7; pior trecho −15,8, pior que o −20,2 do atual), por isso não foi escolhido. O BS-Roformer-SW fica em segundo (−26,2 / −74,9) e é mais rápido.
  - Bateria: SW −24,3 contra −20,3 do atual; o `htdemucs_ft` tem um trecho que falha (pior −1,3).
  - Baixo: SW e `htdemucs_ft` empatam no vazamento (−24,8 / −24,8 contra −21,3 do atual); nas pausas o SW é muito melhor (−60,1 contra −36,4). Ressalva: o pior trecho continua ruim em todos (≈ −4 dB) — não é um ganho uniforme.
  - Guitarra e Piano (BabySlakh): o SW reduz o vazamento de −5,4 para −20,1 dB (guitarra) e de −4,0 para −17,3 dB (piano); nas pausas, −80,9 e −66,5 contra −19,9 e −43,5. Ressalva: na guitarra há um trecho em que todos falham (pior > 0 dB).
  - `--shifts`/`--overlap` maiores no `htdemucs_6s` não melhoram o resultado de forma consistente (voz, bateria e baixo variam ≤ 0,3 dB; guitarra e piano oscilam para os dois lados), então não foram adotados. Pequenas diferenças entre execuções vêm do deslocamento aleatório do Demucs.
  - Ressalva sobre guitarra e piano: o BabySlakh é sintetizado de MIDI a 16 kHz (nada acima de 8 kHz, fora do que os modelos viram no treino), e a métrica de vazamento por mínimos quadrados degenera quando o modelo quase não devolve o instrumento (ex.: `htdemucs_6s` na guitarra, SDR 0,9 dB e pior trecho +29,1 dB). Para esses dois instrumentos o vazamento sintético é indicativo; o que confirma a escolha são as pausas e a música real.
  - Música real do usuário (sem faixa verdadeira; nível de cada faixa nos trechos em que todos concordam que o instrumento está ausente; menor é melhor):
    - Piano e guitarra: o SW deixa silêncio digital (−157,9 / −152,7 dB contra −64,8 / −36,4 dB do atual) — ganho claro.
    - **Voz: piora** — Kim FT2 Bleedless −44,8 dB contra −47,2 dB do atual (`htdemucs_ft` −50,6). Hipótese não verificada: reverberação da voz que os RoFormer mantêm na faixa de voz.
    - **Bateria: piora** — SW −27,7 dB contra −31,3 dB do atual (`htdemucs_ft` −28,1).
    - Baixo: só 11 trechos ausentes; sem base para conclusão.
    - Ou seja: nos dados com faixa verdadeira o escolhido ganha em todos os instrumentos, mas nesta música real voz e bateria ficaram um pouco piores nesse indicador. Por isso a escolha foi levada ao usuário com os pares para ouvir (`fixtures/quality/musica/vocals-*.mp3`, `drums-*.mp3`).
- Velocidade (segundos de processamento por segundo de áudio): GPU — `htdemucs_6s` 0,2; SW 0,4; Kim FT2 Bleedless 0,9 (tabela acima). CPU (16 threads, 1 trecho por modelo, 2026-11-21; reproduzir com `CUDA_VISIBLE_DEVICES= pnpm quality --tracks 1 --candidates htdemucs_6s,bs_roformer_sw,melband_kim_ft2_bleedless`) — `htdemucs_6s` 1,1; SW 2,5; Kim FT2 Bleedless 8,0. Para 4 min de música na CPU: voz ~32 min, demais instrumentos ~10 min (o atual leva ~4 min). Acima do "2 a 4 vezes mais lento" estimado no início para a voz na CPU.
- Modelos escolhidos (rodados pelo `audio-separator` 0.48.0, MIT, com `torch==2.6.0`/`torchaudio==2.6.0` fixados por restrição; o `audio-separator` exige Python ≥ 3.10). Baixados do espelho oficial do audio-separator (`https://github.com/nomadkaraoke/python-audio-separator/releases/download/model-configs/<arquivo>`):
  - Voz: `mel_band_roformer_kim_ft2_bleedless_unwa.ckpt` (913.101.368 bytes, SHA-256 `3c450bd66a98b49dd03231fc5ebb84121eef8418236b179423c2b171d62b04d9`) + `config_mel_band_roformer_kim_ft_unwa.yaml` (1.721 bytes, SHA-256 `c910a0b1493fd3f9cee7a576a7498e44e660510dcaaf5d0d50d5363dde1d0010`).
  - Bateria, Baixo, Guitarra/Violão, Piano/Teclado: `BS-Roformer-SW.ckpt` (699.412.152 bytes, SHA-256 `24e7d35ee9c64415673d3fd33e06a67cac2c103c5df6267ba1576459c775916e`) + `BS-Roformer-SW.yaml` (4.653 bytes, SHA-256 `b558996f1e25eb48798bd6502505a5de94c4f966d6edfb1a0420f06cc40b501a`).
  - Não adotados: `htdemucs_ft` (no baixo empata com o SW no vazamento e perde nas pausas; seria um terceiro modelo, ~320 MB) e `htdemucs_6s` (deixa de ser usado).
  - Total ~1,6 GB de modelos, acima do ~1 GB estimado ao aprovar: o modelo de voz sozinho tem 913 MB. Confirmado pelo usuário (abaixo).
- Aprovado pelo usuário: SIM — escolheu "Melhor modelo por instrumento (Recomendado)" em 2026-11-21 e indicou a música real (`~/Music/My Way (2008 Remastered) - Frank Sinatra.mp3`). Diante da opção de usar só o BS-Roformer-SW (~0,7 GB, dentro do estimado) ou também o modelo de voz maior (~1,6 GB no total, mais lento), respondeu em 2026-11-21: "pode botar o maior". Em 2026-11-22, depois de ouvir os pares da própria música (voz e bateria, atual × novo), confirmou "O novo está melhor"; e, informado de que só na CPU a voz leva ~32 min e os demais ~10 min para 4 min de música (com GPU ~4 min e ~1,6 min), respondeu "Tudo bem, prefiro qualidade".
- Impacto: RF-01, RF-04, RF-11, RF-12, RNF-04 (desempenho); novas tarefas T-903 a T-906; README e benchmark.
