import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { loadMikoConfig } from './config.js';
import type { LoadedMikoConfig } from './config.js';
import type { SkillRequirementInput } from './index.js';

export type DoctorStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  id: 'config' | 'skills' | 'hooks' | 'state-ignore';
  status: DoctorStatus;
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  projectRoot: string;
  configPath?: string;
  specCount: number;
  checks: DoctorCheck[];
}

function skillName(requirement: SkillRequirementInput): string {
  return typeof requirement === 'string' ? requirement : requirement.name;
}

function requiredSkills(config: LoadedMikoConfig): string[] {
  return [...new Set(config.contracts.flatMap((contract) =>
    (contract.requires?.skills ?? []).map(skillName),
  ))].sort();
}

function requiresPostCompact(config: LoadedMikoConfig): boolean {
  return config.contracts.some((contract) =>
    (contract.requires?.skills ?? []).some((requirement) =>
      typeof requirement !== 'string' && requirement.reloadAfterCompaction === true,
    ),
  );
}

function projectSkills(projectRoot: string): Set<string> {
  const skillsRoot = path.join(projectRoot, '.claude', 'skills');
  if (!existsSync(skillsRoot)) return new Set();
  return new Set(readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() &&
      existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')))
    .map((entry) => entry.name));
}

function settingsWithMiko(projectRoot: string): Array<{ pathname: string; value: unknown }> {
  const candidates = [
    path.join(projectRoot, '.claude', 'settings.json'),
    path.join(projectRoot, '.claude', 'settings.local.json'),
  ];
  return candidates.filter(existsSync).map((pathname) => ({
    pathname,
    value: JSON.parse(readFileSync(pathname, 'utf8')) as unknown,
  }));
}

function hookEvents(settings: Array<{ pathname: string; value: unknown }>): Set<string> {
  const found = new Set<string>();
  for (const { value } of settings) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) continue;
    const hooks = (value as Record<string, unknown>).hooks;
    if (typeof hooks !== 'object' || hooks === null || Array.isArray(hooks)) continue;
    for (const [event, groups] of Object.entries(hooks as Record<string, unknown>)) {
      const serialized = JSON.stringify(groups);
      if (serialized.includes('claude-hook-cli') || serialized.includes('koma-miko-claude-hook')) {
        found.add(event);
      }
    }
  }
  return found;
}

function stateIsIgnored(projectRoot: string): boolean {
  const ignorePath = path.join(projectRoot, '.gitignore');
  if (!existsSync(ignorePath)) return false;
  return readFileSync(ignorePath, 'utf8').split(/\r?\n/).some((line) => {
    const value = line.trim().replace(/\\/g, '/');
    return value === '.miko/' || value === '.miko/state/' || value === '/.miko/state/';
  });
}

export function doctorProject(projectRootInput: string): DoctorReport {
  const projectRoot = path.resolve(projectRootInput);
  const checks: DoctorCheck[] = [];
  let config: LoadedMikoConfig;

  try {
    config = loadMikoConfig(projectRoot);
    checks.push({
      id: 'config',
      status: config.format === 'agent-spec' ? 'pass' : 'warn',
      message: config.format === 'agent-spec'
        ? `Valid miko.json with ${config.contracts.length} Agent Spec(s).`
        : `Valid legacy config with ${config.contracts.length} contract(s); migrate to miko.json.`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown config error';
    checks.push({ id: 'config', status: 'fail', message: `Cannot load Miko config: ${reason}` });
    return { ok: false, projectRoot, specCount: 0, checks };
  }

  const required = requiredSkills(config);
  const discovered = projectSkills(projectRoot);
  const missingSkills = required.filter((name) => !discovered.has(name));
  checks.push({
    id: 'skills',
    status: missingSkills.length === 0 ? 'pass' : 'warn',
    message: missingSkills.length === 0
      ? `${required.length} required project Skill(s) discovered.`
      : `Required Skills not found under .claude/skills: ${missingSkills.join(', ')}.`,
  });

  try {
    const settings = settingsWithMiko(projectRoot);
    const foundEvents = hookEvents(settings);
    const requiredEvents = ['PreToolUse', 'PostToolUse'];
    if (requiresPostCompact(config)) requiredEvents.push('PostCompact');
    const missingEvents = requiredEvents.filter((event) => !foundEvents.has(event));
    checks.push({
      id: 'hooks',
      status: missingEvents.length === 0 ? 'pass' : 'warn',
      message: missingEvents.length === 0
        ? `Miko Hooks found for ${requiredEvents.join(', ')}.`
        : `Miko Hook coverage missing: ${missingEvents.join(', ')}.`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown settings error';
    checks.push({ id: 'hooks', status: 'fail', message: `Cannot inspect Claude settings: ${reason}` });
  }

  checks.push({
    id: 'state-ignore',
    status: stateIsIgnored(projectRoot) ? 'pass' : 'warn',
    message: stateIsIgnored(projectRoot)
      ? '.miko/state/ is ignored by Git.'
      : 'Add .miko/state/ to .gitignore before running the adapter.',
  });

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    projectRoot,
    configPath: config.path,
    specCount: config.contracts.length,
    checks,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const marker: Record<DoctorStatus, string> = { pass: 'PASS', warn: 'WARN', fail: 'FAIL' };
  return [
    `Miko Doctor — ${report.projectRoot}`,
    ...report.checks.map((check) => `[${marker[check.status]}] ${check.message}`),
  ].join('\n');
}
