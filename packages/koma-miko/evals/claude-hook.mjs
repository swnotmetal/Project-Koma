import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(packageDir, 'dist', 'claude-hook-cli.js');
const contracts = path.join(packageDir, 'examples', 'claude-code', 'contracts.json');
const stateDir = mkdtempSync(path.join(tmpdir(), 'koma-miko-hook-'));
const cwd = path.join(path.parse(packageDir).root, 'portfolio-fixture');

function run(event) {
  const result = spawnSync(process.execPath, [cli], {
    input: JSON.stringify(event),
    encoding: 'utf8',
    env: {
      ...process.env,
      MIKO_CONTRACTS_PATH: contracts,
      MIKO_STATE_DIR: stateDir,
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || `Hook exited ${result.status}`);
  return result.stdout ? JSON.parse(result.stdout) : undefined;
}

try {
  const edit = {
    session_id: 'cross-process-fixture',
    cwd,
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: path.join(cwd, 'src', 'components', 'Hero.tsx'),
      old_string: 'must-not-persist',
      new_string: 'must-not-persist',
    },
  };
  const first = run(edit);
  run({
    session_id: 'cross-process-fixture',
    cwd,
    hook_event_name: 'PostToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'frontend-design' },
  });
  const second = run(edit);

  const ledger = readFileSync(path.join(stateDir, readdirSync(stateDir)[0]), 'utf8');
  const passed = first?.hookSpecificOutput?.permissionDecision === 'deny' &&
    second?.hookSpecificOutput?.permissionDecision === 'allow' &&
    ledger.includes('"type":"decision_recorded"') &&
    ledger.includes('"decision":"DENY"') &&
    !ledger.includes('must-not-persist');
  if (!passed) throw new Error('Claude hook persistence fixture failed');
  console.log('Miko Claude hook: PASS (audited DENY -> observed Skill -> ALLOW; no code content persisted)');
} finally {
  rmSync(stateDir, { recursive: true, force: true });
}
