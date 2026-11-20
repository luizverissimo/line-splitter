// PreToolUse (Edit/Write/MultiEdit): o PRD só muda com o usuário aprovando na hora.
import path from 'node:path';
import { readStdinJson, PATHS, ROOT } from '../scripts/lib.mjs';

const input = await readStdinJson();
const file = input.tool_input?.file_path;
if (file && path.resolve(ROOT, file).toLowerCase() === PATHS.prd.toLowerCase()) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: 'docs/PRD.md é a fonte da verdade; só altere se o usuário pediu.',
    },
  }));
}
