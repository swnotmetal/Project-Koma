#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { doctorProject, formatDoctorReport } from './doctor.js';
import type { DoctorHost } from './doctor.js';

function help(): string {
  return [
    'koma-miko demo',
    'koma-miko doctor [--project <path>] [--host claude|codex|gemini] [--json] [--strict]',
    '',
    'Runs a deterministic, no-API Agent Spec replay.',
    'Runs offline checks for miko.json, host Skills, Hooks, and Git ignore.',
  ].join('\n');
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
if (args[0] === 'demo') {
  const packageRoot = path.resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const replay = path.join(packageRoot, 'evals', 'replay.mjs');
  const result = spawnSync(process.execPath, [replay], { stdio: 'inherit' });
  if (result.error) {
    process.stderr.write(`Unable to run Miko demo: ${result.error.message}\n`);
    process.exitCode = 1;
  } else if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
} else if (args[0] !== 'doctor') {
  process.stdout.write(`${help()}\n`);
  process.exitCode = args.length === 0 || args.includes('--help') ? 0 : 1;
} else {
  const projectRoot = path.resolve(option(args, '--project') ?? process.cwd());
  const requestedHost = option(args, '--host') ?? 'claude';
  if (requestedHost !== 'claude' && requestedHost !== 'codex' && requestedHost !== 'gemini') {
    process.stdout.write(`Unknown host "${requestedHost}". Choose claude, codex, or gemini.\n`);
    process.exitCode = 1;
  } else {
    const report = doctorProject(projectRoot, { host: requestedHost as DoctorHost });
    process.stdout.write(args.includes('--json')
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${formatDoctorReport(report)}\n`);
    const warningsFail = args.includes('--strict') && report.checks.some((check) => check.status === 'warn');
    process.exitCode = report.ok && !warningsFail ? 0 : 1;
  }
}
