import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cli = path.join(packageDir, 'dist', 'claude-hook-cli.js');
const contracts = path.join(packageDir, 'examples', 'claude-code', 'miko.json');
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
  run({
    session_id: 'cross-process-fixture',
    cwd,
    hook_event_name: 'PostCompact',
    trigger: 'auto',
  });
  const afterCompact = run(edit);
  run({
    session_id: 'cross-process-fixture',
    cwd,
    hook_event_name: 'PostToolUse',
    tool_name: 'Skill',
    tool_input: { skill: 'frontend-design' },
  });
  const afterReload = run(edit);

  const stateFiles = readdirSync(stateDir);
  const ledger = readFileSync(path.join(stateDir, stateFiles.find((name) => name.endsWith('.jsonl'))), 'utf8');
  const snapshot = readFileSync(
    path.join(stateDir, stateFiles.find((name) => name.endsWith('.snapshot.json'))),
    'utf8',
  );
  const passed = first?.hookSpecificOutput?.permissionDecision === 'deny' &&
    second === undefined &&
    afterCompact?.hookSpecificOutput?.permissionDecision === 'deny' &&
    afterReload === undefined &&
    ledger.includes('"type":"decision_recorded"') &&
    ledger.includes('"decision":"DENY"') &&
    ledger.includes('"type":"context_advanced"') &&
    !ledger.includes('must-not-persist') &&
    !snapshot.includes('must-not-persist');
  if (!passed) throw new Error('Claude hook persistence fixture failed');
  console.log(
    'Miko Claude hook: PASS (snapshot restore; DENY -> Skill -> host-deferred ALLOW -> compact -> DENY -> reload -> host-deferred ALLOW; no code content persisted)',
  );
} finally {
  rmSync(stateDir, { recursive: true, force: true });
}
