// Decide se o Electron de desenvolvimento consegue usar o sandbox de processo do Chromium nesta máquina.
// No Ubuntu 24.04+ o AppArmor bloqueia user namespaces sem privilégio; aí o Chromium exige que
// `chrome-sandbox` seja do root com modo 4755. O pacote .deb instalado faz isso; o binário em node_modules não.
import fs from 'node:fs';
import path from 'node:path';

function readSysctl(name) {
  try {
    return fs.readFileSync(`/proc/sys/${name.replaceAll('.', '/')}`, 'utf8').trim();
  } catch {
    return null;
  }
}

/** @param {string} electronBinary caminho do executável do Electron */
export function sandboxStatus(electronBinary) {
  if (process.platform !== 'linux') return { ok: true };
  const helper = path.join(path.dirname(electronBinary), 'chrome-sandbox');
  let suidOk = false;
  try {
    const st = fs.statSync(helper);
    suidOk = st.uid === 0 && (st.mode & 0o4000) !== 0;
  } catch {
    suidOk = false;
  }
  const userns = readSysctl('kernel.unprivileged_userns_clone') !== '0';
  const restricted = readSysctl('kernel.apparmor_restrict_unprivileged_userns') === '1';
  if (suidOk || (userns && !restricted)) return { ok: true };
  return {
    ok: false,
    fix: `sudo chown root:root "${helper}" && sudo chmod 4755 "${helper}"`,
  };
}

export const NO_SANDBOX_ENV = 'LINE_SPLITTER_DEV_NO_SANDBOX';

/**
 * Argumentos extras para lançar o Electron de desenvolvimento/teste.
 * Sem o sandbox do SO disponível, só segue com --no-sandbox se o desenvolvedor optar explicitamente
 * (LINE_SPLITTER_DEV_NO_SANDBOX=1); caso contrário falha mostrando o comando de correção.
 */
export function devElectronArgs(electronBinary, env = process.env) {
  const status = sandboxStatus(electronBinary);
  if (status.ok) return [];
  const help =
    'O sandbox de processo do Chromium não está disponível neste Linux ' +
    '(AppArmor restringe user namespaces e chrome-sandbox não é SUID root).\n' +
    `Para corrigir, rode uma vez:\n  ${status.fix}\n`;
  if (env[NO_SANDBOX_ENV] !== '1') {
    throw new Error(
      `${help}Ou, só para desenvolvimento, defina ${NO_SANDBOX_ENV}=1 para rodar com --no-sandbox ` +
        '(contextIsolation, sem Node e preload restrito continuam ativos).',
    );
  }
  console.warn(`\n[line-splitter] AVISO: ${help}Rodando com --no-sandbox porque ${NO_SANDBOX_ENV}=1.\n`);
  return ['--no-sandbox'];
}
