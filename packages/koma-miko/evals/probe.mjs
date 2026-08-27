import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runConformance } from './hook-conformance.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HOSTS = {
  claude: {
    label: 'Claude Code',
    steps: 7,
    events: ['PreToolUse', 'PostToolUse', 'PostCompact'],
    tools: ['Edit', 'Skill'],
    argumentKeys: ['file_path', 'skill'],
    recovery: 'DENY -> Skill -> ALLOW -> compact -> DENY -> reload -> ALLOW',
  },
  codex: {
    label: 'Codex',
    steps: 6,
    events: ['PreToolUse', 'PostToolUse', 'Stop'],
    tools: ['apply_patch', 'Bash'],
    argumentKeys: ['command'],
    recovery: 'DENY -> exact Skill read -> ALLOW -> COMPLETE',
  },
  gemini: {
    label: 'Gemini CLI',
    steps: 6,
    events: ['BeforeTool', 'AfterTool', 'AfterAgent'],
    tools: ['replace', 'activate_skill'],
    argumentKeys: ['file_path', 'name'],
    recovery: 'DENY -> activate_skill -> ALLOW -> COMPLETE',
  },
  vscode: {
    label: 'VS Code Copilot',
    steps: 6,
    events: ['PreToolUse', 'PostToolUse', 'Stop'],
    tools: ['replace_string_in_file', 'read_file'],
    argumentKeys: ['filePath'],
    recovery: 'DENY -> explicit SKILL.md read -> ALLOW -> COMPLETE',
  },
};

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function assertHost(value) {
  const normalized = value === 'copilot' ? 'vscode' : value;
  if (!(normalized in HOSTS)) {
    throw new Error(`Unknown host "${value}". Choose claude, codex, gemini, or vscode.`);
  }
  return normalized;
}

function runClaudeProbe() {
  const script = join(packageRoot, 'evals', 'claude-hook.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: packageRoot,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `Claude probe exited ${result.status}`);
  }
}

function formatReport(report) {
  return [
    `Miko probe (${report.host}) - PASS`,
    `[OK] ${report.steps} isolated Hook events exercised`,
    `[OK] ${report.recovery}`,
    '[OK] report contains host metadata only; prompt, source, and tool output omitted',
    '[OK] no model or API invoked; temporary fixture removed',
    `[NOTE] ${report.limitation}`,
  ].join('\n');
}

export async function runProbe(hostInput) {
  const host = assertHost(hostInput);
  const profile = HOSTS[host];
  if (host === 'claude') runClaudeProbe();
  else await runConformance(host);

  const packageJson = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
  return {
    schemaVersion: 1,
    kind: 'offline-hook-conformance',
    status: 'PASS',
    package: `koma-miko@${packageJson.version}`,
    host,
    hostLabel: profile.label,
    steps: profile.steps,
    events: profile.events,
    tools: profile.tools,
    argumentKeys: profile.argumentKeys,
    recovery: profile.recovery,
    modelInvoked: false,
    projectModified: false,
    privacy: {
      containsPrompt: false,
      containsSource: false,
      containsToolOutput: false,
    },
    cleanup: 'complete',
    limitation: 'Offline adapter conformance only; this does not prove that an installed host emits the same events or tool names.',
  };
}

async function main() {
  const args = process.argv.slice(2);
  const host = option(args, '--host') ?? 'claude';
  const report = await runProbe(host);
  process.stdout.write(args.includes('--json')
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatReport(report)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Miko probe failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
