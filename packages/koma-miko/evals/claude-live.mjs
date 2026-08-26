import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const hookCli = path.join(packageDir, 'dist', 'claude-hook-cli.js');
const fixtureDir = mkdtempSync(path.join(packageDir, '.miko-live-'));
const stateDir = path.join(fixtureDir, '.miko', 'state');
const budget = process.env.MIKO_LIVE_MAX_BUDGET_USD ?? '0.10';
const model = process.env.MIKO_LIVE_MODEL ?? 'haiku';
const claudeBin = process.env.MIKO_CLAUDE_BIN ?? (process.platform === 'win32' ? 'claude.exe' : 'claude');

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY must be set in the parent process. The eval never reads an env file.');
}
if (!/^\d+(\.\d+)?$/.test(budget) || Number(budget) <= 0 || Number(budget) > 1) {
  throw new Error('MIKO_LIVE_MAX_BUDGET_USD must be greater than 0 and no more than 1.');
}

function writeFixture() {
  const settingsDir = path.join(fixtureDir, '.claude');
  const skillDir = path.join(settingsDir, 'skills', 'frontend-design');
  const componentDir = path.join(fixtureDir, 'src', 'components');
  mkdirSync(skillDir, { recursive: true });
  mkdirSync(componentDir, { recursive: true });
  mkdirSync(path.join(fixtureDir, '.miko'), { recursive: true });

  writeFileSync(path.join(componentDir, 'Hero.tsx'), [
    'export function Hero() {',
    "  return <h1>Before Miko</h1>;",
    '}',
    '',
  ].join('\n'));

  writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    'name: frontend-design',
    'description: Rules for the Miko LFX-17 visual fixture. Use when Miko requests this skill.',
    '---',
    '',
    '# Frontend design fixture rule',
    '',
    'When editing `src/components/Hero.tsx`:',
    '',
    '- Preserve the component structure.',
    '- Add `// MIKO_SKILL_APPLIED` immediately above the export.',
    '- Change only the user-requested visible text.',
    '',
  ].join('\n'));

  writeFileSync(path.join(fixtureDir, 'miko.json'), JSON.stringify({
    version: 1,
    specs: [
      {
        id: 'ui-skill-checkpoint',
        appliesWhen: {
          action: {
            tools: ['Edit', 'Write'],
            pathPrefixes: ['src/components'],
          },
        },
        requires: {
          skills: [{ name: 'frontend-design', reloadAfterCompaction: true }],
        },
        mode: 'enforce',
      },
    ],
  }, null, 2));

  const hook = {
    type: 'command',
    command: 'node',
    args: [hookCli],
  };
  writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: 'Edit|Write', hooks: [hook] }],
      PostToolUse: [{ matcher: 'Skill|Read|Edit|Write', hooks: [hook] }],
      PostCompact: [{ hooks: [hook] }],
    },
  }, null, 2));
}

function readLedger() {
  if (!existsSync(stateDir)) return [];
  if (!readdirSync(stateDir, { withFileTypes: true }).some((entry) => entry.isFile())) return [];
  return readdirSync(stateDir)
    .filter((name) => name.endsWith('.jsonl'))
    .flatMap((name) => readFileSync(path.join(stateDir, name), 'utf8').split(/\r?\n/))
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function redact(value) {
  return String(value ?? '').replaceAll(process.env.ANTHROPIC_API_KEY, '[REDACTED]');
}

try {
  writeFixture();
  const result = spawnSync(claudeBin, [
    '-p',
    'In src/components/Hero.tsx, change the visible text from Before Miko to After Miko. Make no other user-requested change. Use the Edit tool, not a shell command.',
    '--model', model,
    '--max-turns', '6',
    '--max-budget-usd', budget,
    '--output-format', 'json',
    // This disposable fixture exposes no Bash/network tool. Avoid an
    // interactive edit prompt so the eval measures Miko rather than the TTY.
    '--permission-mode', 'bypassPermissions',
    '--dangerously-skip-permissions',
    '--tools', 'Read,Edit,Skill',
    '--allowedTools', 'Read,Edit,Skill',
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--no-session-persistence',
  ], {
    cwd: fixtureDir,
    encoding: 'utf8',
    env: {
      ...process.env,
      MIKO_STATE_DIR: stateDir,
    },
    timeout: 180_000,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Claude exited ${result.status}: ${redact(result.stderr || result.stdout).slice(-3000)}`);
  }

  const response = JSON.parse(result.stdout);
  const ledger = readLedger();
  const component = readFileSync(path.join(fixtureDir, 'src', 'components', 'Hero.tsx'), 'utf8');
  const denialIndex = ledger.findIndex((record) =>
    record.type === 'decision_recorded' && record.decision === 'DENY');
  const skillIndex = ledger.findIndex((record) =>
    record.type === 'evidence_recorded' &&
    record.evidence?.type === 'skill_loaded' &&
    record.evidence?.name === 'frontend-design' &&
    record.evidence?.source === 'observed');
  const artifactIndex = ledger.findIndex((record) =>
    record.type === 'evidence_recorded' &&
    record.evidence?.type === 'artifact_changed' &&
    record.evidence?.path === 'src/components/Hero.tsx');
  const auditTrail = ledger.map((record) => {
    if (record.type === 'decision_recorded') {
      return `decision:${record.decision}:${record.reasonCode}`;
    }
    if (record.type === 'contract_activated') return `contract:${record.contractId}`;
    if (record.type === 'evidence_recorded') {
      const detail = record.evidence?.name ?? record.evidence?.path ?? record.evidence?.tool ?? '';
      return `evidence:${record.evidence?.type}:${detail}`;
    }
    return record.type;
  });

  const summary = {
    model,
    maxBudgetUsd: Number(budget),
    actualCostUsd: response.total_cost_usd,
    turns: response.num_turns,
    claudeSucceeded: !response.is_error,
    mikoBoundarySequence: denialIndex >= 0 && skillIndex > denialIndex && artifactIndex > skillIndex
      ? 'DENY -> observed skill -> changed artifact'
      : 'FAILED',
    skillRuleApplied: component.includes('// MIKO_SKILL_APPLIED'),
    requestedEditApplied: component.includes('After Miko'),
    promptOrCodePersistedByMiko: JSON.stringify(ledger).includes('Before Miko') ||
      JSON.stringify(ledger).includes('After Miko'),
    auditTrail,
    claudeResult: String(response.result ?? '').slice(0, 800),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (summary.mikoBoundarySequence === 'FAILED' ||
      !summary.requestedEditApplied ||
      summary.promptOrCodePersistedByMiko) {
    process.exitCode = 1;
  }
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}
