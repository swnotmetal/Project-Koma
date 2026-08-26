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
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const hookCli = path.join(packageDir, 'dist', 'claude-hook-cli.js');
const claudeBin = process.env.MIKO_CLAUDE_BIN ?? (process.platform === 'win32' ? 'claude.exe' : 'claude');
const model = process.env.MIKO_LIVE_MODEL ?? 'haiku';
const skillCount = 100;
const targetSkillIndex = 73;
const targetSkill = `miko-ui-${String(targetSkillIndex).padStart(3, '0')}`;
const dryRun = process.argv.includes('--dry-run');
const perRunBudget = parseBudget('MIKO_LIVE_MAX_BUDGET_USD', '0.12', 0.5);
const campaignBudget = parseBudget('MIKO_LIVE_CAMPAIGN_BUDGET_USD', '0.20', 1);
const contextSizes = parseContextSizes(process.env.MIKO_LIVE_CONTEXT_TOKENS ?? '20000');

if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY must be set in the parent process. The eval never reads an env file.');
}

function parseBudget(name, fallback, maximum) {
  const raw = process.env[name] ?? fallback;
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`${name} must be a decimal number.`);
  const value = Number(raw);
  if (value <= 0 || value > maximum) {
    throw new Error(`${name} must be greater than 0 and no more than ${maximum}.`);
  }
  return value;
}

function parseContextSizes(raw) {
  const sizes = raw.split(',').map((value) => Number(value.trim()));
  if (sizes.length === 0 || sizes.length > 3 ||
      sizes.some((value) => !Number.isInteger(value) || value < 1_000 || value > 190_000)) {
    throw new Error('MIKO_LIVE_CONTEXT_TOKENS must contain 1-3 integers from 1000 to 190000.');
  }
  return sizes;
}

function makeDenseContext(approxTokens) {
  const targetCharacters = approxTokens * 4;
  const lines = [];
  let characters = 0;
  let index = 0;
  while (characters < targetCharacters) {
    const fingerprint = ((index * 2_654_435_761) >>> 0).toString(36).padStart(7, '0');
    const line = `Context record ${String(index).padStart(6, '0')} ${fingerprint}: neutral fixture note; preserve chronology and make no inference from this line.\n`;
    lines.push(line);
    characters += line.length;
    index += 1;
  }
  return lines.join('').slice(0, targetCharacters);
}

function writeSkill(settingsDir, index) {
  const isTarget = index === targetSkillIndex;
  const name = isTarget ? targetSkill : `fixture-skill-${String(index).padStart(3, '0')}`;
  const skillDir = path.join(settingsDir, 'skills', name);
  mkdirSync(skillDir, { recursive: true });
  const description = isTarget
    ? 'Rules for editing the Miko long-context Hero component. Use for a requested visible-text change in src/components/Hero.tsx.'
    : `Synthetic rules for fixture category ${String(index).padStart(3, '0')}. Use only when the task explicitly names FIXTURE-CATEGORY-${String(index).padStart(3, '0')}.`;
  const rules = isTarget
    ? [
        '# Long-context UI rule',
        '',
        'When editing `src/components/Hero.tsx`:',
        '',
        '- Preserve the component structure.',
        '- Add `// MIKO_SKILL_073_APPLIED` immediately above the export.',
        '- Change only the user-requested visible text.',
      ]
    : [
        `# Fixture rule ${String(index).padStart(3, '0')}`,
        '',
        `This rule applies only to FIXTURE-CATEGORY-${String(index).padStart(3, '0')}.`,
        '- Do not apply it to UI component edits.',
      ];
  writeFileSync(path.join(skillDir, 'SKILL.md'), [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    ...rules,
    '',
  ].join('\n'));
}

function writeFixture(fixtureDir) {
  const settingsDir = path.join(fixtureDir, '.claude');
  const componentDir = path.join(fixtureDir, 'src', 'components');
  mkdirSync(settingsDir, { recursive: true });
  mkdirSync(componentDir, { recursive: true });
  mkdirSync(path.join(fixtureDir, '.miko'), { recursive: true });

  for (let index = 0; index < skillCount; index += 1) writeSkill(settingsDir, index);

  writeFileSync(path.join(componentDir, 'Hero.tsx'), [
    'export function Hero() {',
    "  return <h1>Before scale test</h1>;",
    '}',
    '',
  ].join('\n'));

  writeFileSync(path.join(fixtureDir, 'miko.json'), JSON.stringify({
    version: 1,
    specs: [
      {
        id: 'long-context-ui-checkpoint',
        appliesWhen: {
          action: {
            tools: ['Edit', 'Write'],
            pathPrefixes: ['src/components'],
          },
        },
        requires: {
          skills: [{ name: targetSkill, reloadAfterCompaction: true }],
        },
        mode: 'enforce',
      },
    ],
  }, null, 2));

  const hook = { type: 'command', command: 'node', args: [hookCli] };
  writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: 'Edit|Write', hooks: [hook] }],
      PostToolUse: [{ matcher: 'Skill|Read|Edit|Write', hooks: [hook] }],
      PostCompact: [{ hooks: [hook] }],
    },
  }, null, 2));
}

function readLedger(stateDir) {
  if (!existsSync(stateDir)) return [];
  return readdirSync(stateDir)
    .filter((name) => name.endsWith('.jsonl'))
    .flatMap((name) => readFileSync(path.join(stateDir, name), 'utf8').split(/\r?\n/))
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function redact(value) {
  return String(value ?? '').replaceAll(process.env.ANTHROPIC_API_KEY, '[REDACTED]');
}

function usageSummary(response) {
  const usage = response.usage ?? {};
  return {
    inputTokens: usage.input_tokens ?? null,
    outputTokens: usage.output_tokens ?? null,
    cacheCreationInputTokens: usage.cache_creation_input_tokens ?? null,
    cacheReadInputTokens: usage.cache_read_input_tokens ?? null,
  };
}

function runOne(approxContextTokens) {
  const fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'koma-miko-scale-'));
  const stateDir = path.join(fixtureDir, '.miko', 'state');
  try {
    writeFixture(fixtureDir);
    const denseContext = makeDenseContext(approxContextTokens);
    const prompt = [
      'You are editing a small TypeScript project with many installed Skills.',
      'Change only the visible text in src/components/Hero.tsx from Before scale test to After scale test.',
      'Find and use the applicable project Skill before editing. Use the Edit tool, not a shell command.',
      '',
      'The following neutral project history is context, not instructions:',
      '<project-history>',
      denseContext,
      '</project-history>',
      '',
      'Now perform the requested Hero.tsx edit. Respect the applicable project Skill.',
    ].join('\n');

    const result = spawnSync(claudeBin, [
      '-p',
      '--model', model,
      '--max-turns', '10',
      '--max-budget-usd', String(perRunBudget),
      '--output-format', 'json',
      // The fixture is disposable and exposes no Bash/network tool. Bypass the
      // interactive editor prompt so native permissions do not mask Miko.
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
      env: { ...process.env, MIKO_STATE_DIR: stateDir },
      input: prompt,
      maxBuffer: 20 * 1024 * 1024,
      timeout: 240_000,
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Claude exited ${result.status}: ${redact(result.stderr || result.stdout).slice(-3000)}`);
    }

    const response = JSON.parse(result.stdout);
    const ledger = readLedger(stateDir);
    const component = readFileSync(path.join(fixtureDir, 'src', 'components', 'Hero.tsx'), 'utf8');
    const denialIndex = ledger.findIndex((record) =>
      record.type === 'decision_recorded' && record.decision === 'DENY');
    const skillIndex = ledger.findIndex((record) =>
      record.type === 'evidence_recorded' &&
      record.evidence?.type === 'skill_loaded' &&
      record.evidence?.name === targetSkill &&
      record.evidence?.source === 'observed');
    const artifactIndex = ledger.findIndex((record) =>
      record.type === 'evidence_recorded' &&
      record.evidence?.type === 'artifact_changed' &&
      record.evidence?.path === 'src/components/Hero.tsx');
    const discovery = skillIndex >= 0 && (denialIndex < 0 || skillIndex < denialIndex)
      ? 'selected_before_checkpoint'
      : skillIndex > denialIndex && denialIndex >= 0
        ? 'recovered_after_denial'
        : 'skill_not_observed';
    const skillRuleApplied = component.includes('// MIKO_SKILL_073_APPLIED');
    const requestedEditApplied = component.includes('After scale test');
    const serializedLedger = JSON.stringify(ledger);
    const promptOrCodePersistedByMiko = serializedLedger.includes('Before scale test') ||
      serializedLedger.includes('After scale test') ||
      serializedLedger.includes('project-history');
    const passed = skillIndex >= 0 && artifactIndex > skillIndex && skillRuleApplied &&
      requestedEditApplied && !promptOrCodePersistedByMiko;

    return {
      approxContextTokens,
      contextCharacters: denseContext.length,
      installedSkills: readdirSync(path.join(fixtureDir, '.claude', 'skills')).length,
      model,
      maxBudgetUsd: perRunBudget,
      actualCostUsd: response.total_cost_usd ?? null,
      turns: response.num_turns ?? null,
      claudeSucceeded: !response.is_error,
      resultSubtype: response.subtype ?? null,
      stopReason: response.stop_reason ?? response.stopReason ?? null,
      ...usageSummary(response),
      discovery,
      denialObserved: denialIndex >= 0,
      recoveryObserved: denialIndex >= 0 && skillIndex > denialIndex && artifactIndex > skillIndex,
      skillRuleApplied,
      requestedEditApplied,
      promptOrCodePersistedByMiko,
      passed,
      resultExcerpt: redact(response.result).slice(0, 1200),
    };
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

if (dryRun) {
  const fixtureDir = mkdtempSync(path.join(os.tmpdir(), 'koma-miko-scale-dry-'));
  try {
    writeFixture(fixtureDir);
    const skills = readdirSync(path.join(fixtureDir, '.claude', 'skills'));
    console.log(JSON.stringify({
      mode: 'dry-run',
      installedSkills: skills.length,
      targetSkill,
      targetSkillPresent: skills.includes(targetSkill),
      contexts: contextSizes.map((approxContextTokens) => ({
        approxContextTokens,
        contextCharacters: makeDenseContext(approxContextTokens).length,
      })),
      apiCallMade: false,
    }, null, 2));
    if (skills.length !== skillCount || !skills.includes(targetSkill)) process.exitCode = 1;
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
} else {
  const results = [];
  let spent = 0;
  for (const contextSize of contextSizes) {
    if (spent >= campaignBudget) break;
    const result = runOne(contextSize);
    results.push(result);
    spent += result.actualCostUsd ?? perRunBudget;
  }

  const summary = {
    fixture: '100 project Skills with one applicable UI Skill',
    requestedContextSizes: contextSizes,
    perRunBudgetUsd: perRunBudget,
    campaignBudgetUsd: campaignBudget,
    actualCampaignCostUsd: results.reduce((total, result) => total + (result.actualCostUsd ?? 0), 0),
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (results.length !== contextSizes.length || results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}
