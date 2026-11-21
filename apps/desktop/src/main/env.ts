import fs from 'node:fs';
import path from 'node:path';

export const USER_DATA_ENV = 'LINE_SPLITTER_USER_DATA';
export const DEV_URL_ENV = 'LINE_SPLITTER_DEV_URL';

export const MUSIC_DIR_ENV = 'LINE_SPLITTER_MUSIC_DIR';

/** Lê uma pasta absoluta de uma variável de ambiente, cria se faltar e confere a escrita. */
function resolveDirOverride(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return null;
  if (!path.isAbsolute(raw)) {
    throw new Error(`${name} precisa ser um caminho absoluto (recebido: "${raw}").`);
  }
  fs.mkdirSync(raw, { recursive: true });
  try {
    fs.accessSync(raw, fs.constants.W_OK);
  } catch {
    throw new Error(`${name} aponta para uma pasta sem permissão de escrita: ${raw}`);
  }
  return raw;
}

/**
 * Pasta de dados alternativa (usada pelos testes para isolar o banco e o motor).
 * Devolve null se a variável não estiver definida; lança erro claro se estiver inválida.
 */
export function resolveUserDataOverride(env: NodeJS.ProcessEnv): string | null {
  return resolveDirOverride(env, USER_DATA_ENV);
}

/**
 * Pasta de Música alternativa (base da pasta de saída padrão). Usada pelos testes em qualquer
 * sistema — no Windows a pasta de Música não vem de variável de ambiente — para nunca gravar
 * na pasta real do usuário.
 */
export function resolveMusicDirOverride(env: NodeJS.ProcessEnv): string | null {
  return resolveDirOverride(env, MUSIC_DIR_ENV);
}

/** URL do Vite em desenvolvimento; só aceita http(s) em localhost para não carregar conteúdo remoto. */
export function resolveDevUrl(env: NodeJS.ProcessEnv): URL | null {
  const raw = env[DEV_URL_ENV];
  if (raw === undefined || raw.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${DEV_URL_ENV} não é uma URL válida: "${raw}"`);
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!['http:', 'https:'].includes(url.protocol) || !localHosts.has(url.hostname)) {
    throw new Error(`${DEV_URL_ENV} deve apontar para localhost (recebido: "${raw}").`);
  }
  return url;
}
