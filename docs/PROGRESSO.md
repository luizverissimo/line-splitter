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
