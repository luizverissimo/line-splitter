// PostToolUse (Edit/Write/MultiEdit): recusa na hora mock, TODO e afins no código de produção.
import { readStdinJson } from '../scripts/lib.mjs';
import { inScope, scanFile, formatHits } from '../scripts/anti-mock.mjs';

const input = await readStdinJson();
const file = input.tool_input?.file_path;
if (!file || !inScope(file)) process.exit(0);

const hits = scanFile(file);
if (hits.length) {
  process.stdout.write(JSON.stringify({
    decision: 'block',
    reason:
      `Código de produção com simulação/pendência — proibido pelo CLAUDE.md:\n${formatHits(hits)}\n` +
      'Substitua por implementação real agora. Se for um caso legítimo (ex.: palavra de domínio), ' +
      'comente na linha `// guard-allow: motivo`.',
  }));
}
