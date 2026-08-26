#!/usr/bin/env node
import path from 'node:path';
import { doctorProject, formatDoctorReport } from './doctor.js';

function help(): string {
  return [
    'koma-miko doctor [--project <path>] [--json] [--strict]',
    '',
    'Runs offline checks for miko.json, project Skills, Claude Hooks, and Git ignore.',
  ].join('\n');
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const args = process.argv.slice(2);
if (args[0] !== 'doctor') {
  process.stdout.write(`${help()}\n`);
  process.exitCode = args.length === 0 || args.includes('--help') ? 0 : 1;
} else {
  const projectRoot = path.resolve(option(args, '--project') ?? process.cwd());
  const report = doctorProject(projectRoot);
  process.stdout.write(args.includes('--json')
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatDoctorReport(report)}\n`);
  const warningsFail = args.includes('--strict') && report.checks.some((check) => check.status === 'warn');
  process.exitCode = report.ok && !warningsFail ? 0 : 1;
}
