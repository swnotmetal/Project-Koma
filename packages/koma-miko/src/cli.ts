#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { doctorProject, formatDoctorReport } from './doctor.js';
import type { DoctorHost } from './doctor.js';
import { initProject } from './init.js';

function help(): string {
  return [
    'koma-miko demo',
    'koma-miko probe [--host claude|codex|gemini|vscode] [--json]',
    'koma-miko init [--project <path>] [--host claude|codex|gemini|vscode] [--skill <name>] [--path <prefix>] [--mode review|enforce] [--enforce] [--dry-run]',
    'koma-miko doctor [--project <path>] [--host claude|codex|gemini|vscode] [--json] [--strict]',
    '',
    'Runs a deterministic, no-API Agent Spec replay.',
    'Runs an isolated, no-model host-adapter conformance probe and removes its fixture.',
    'Initializes a starter Agent Spec and host Hooks without overwriting existing settings.',
    'Runs offline checks for miko.json, host Skills, Hooks, Git ignore, and a Codex runtime heartbeat.',
  ].join('\n');
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function normalizedHost(value: string | undefined): DoctorHost | undefined {
  if (value === 'copilot') return 'vscode';
  if (value === 'claude' || value === 'codex' || value === 'gemini' || value === 'vscode') {
    return value;
  }
  return undefined;
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
} else if (args[0] === 'probe') {
  const packageRoot = path.resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const probe = path.join(packageRoot, 'evals', 'probe.mjs');
  const requestedHost = option(args, '--host') ?? 'claude';
  const host = normalizedHost(requestedHost);
  if (!host) {
    process.stdout.write(`Unknown host "${requestedHost}". Choose claude, codex, gemini, or vscode.\n`);
    process.exitCode = 1;
  } else {
    const result = spawnSync(process.execPath, [probe, '--host', host, ...(hasFlag(args, '--json') ? ['--json'] : [])], {
      stdio: 'inherit',
    });
    if (result.error) {
      process.stderr.write(`Unable to run Miko probe: ${result.error.message}\n`);
      process.exitCode = 1;
    } else if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
    }
  }
} else if (args[0] === 'init') {
  const projectRoot = path.resolve(option(args, '--project') ?? process.cwd());
  const requestedHost = option(args, '--host') ?? 'claude';
  const host = normalizedHost(requestedHost);
  if (!host) {
    process.stdout.write(`Unknown host "${requestedHost}". Choose claude, codex, gemini, or vscode.\n`);
    process.exitCode = 1;
  } else {
    const requestedMode = option(args, '--mode');
    const mode = hasFlag(args, '--enforce') ? 'enforce' : requestedMode ?? 'review';
    if (mode !== 'review' && mode !== 'enforce') {
      process.stdout.write(`Unknown mode "${mode}". Choose review or enforce.\n`);
      process.exitCode = 1;
    } else {
      try {
        const result = initProject(projectRoot, {
          host,
          skill: option(args, '--skill'),
          pathPrefix: option(args, '--path'),
          mode,
          dryRun: hasFlag(args, '--dry-run'),
        });
        const prefix = hasFlag(args, '--dry-run') ? 'Miko init (dry run)' : 'Miko init';
        process.stdout.write(`${prefix} (${result.host}) — ${result.projectRoot}\n`);
        process.stdout.write(result.changes.length > 0
          ? result.changes.map((change) => `[OK] ${change}`).join('\n') + '\n'
          : '[OK] Project is already initialized; no files changed.\n');
        if (result.backupPath) process.stdout.write(`[OK] backed up existing settings to ${result.backupPath}\n`);
        if (hasFlag(args, '--dry-run')) {
          process.stdout.write('Review the generated starter spec, then start a new host session.\n');
        } else {
          const report = doctorProject(result.projectRoot, { host: result.host });
          process.stdout.write(`${formatDoctorReport(report)}\n`);
          if (result.host === 'codex') {
            process.stdout.write([
              'ACTION REQUIRED: Codex skips project Hooks until you review and trust them.',
              'In Codex CLI, open this project, run /hooks, trust the five Miko Hooks, run one turn, then run:',
              '  npx koma-miko doctor --host codex --strict',
              'If the codex command is unavailable, Desktop-only activation is currently Preview and may not surface this review clearly.',
              'Miko cannot safely automate the host trust decision.',
            ].join('\n') + '\n');
          } else {
            process.stdout.write('Edit miko.json to match your project, then start a new host session.\n');
          }
          if (!report.ok) process.exitCode = 1;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        process.stdout.write(`Miko init failed: ${reason}\n`);
        process.exitCode = 1;
      }
    }
  }
} else if (args[0] !== 'doctor') {
  process.stdout.write(`${help()}\n`);
  process.exitCode = args.length === 0 || args.includes('--help') ? 0 : 1;
} else {
  const projectRoot = path.resolve(option(args, '--project') ?? process.cwd());
  const requestedHost = option(args, '--host') ?? 'claude';
  const host = normalizedHost(requestedHost);
  if (!host) {
    process.stdout.write(`Unknown host "${requestedHost}". Choose claude, codex, gemini, or vscode.\n`);
    process.exitCode = 1;
  } else {
    const report = doctorProject(projectRoot, { host });
    process.stdout.write(args.includes('--json')
      ? `${JSON.stringify(report, null, 2)}\n`
      : `${formatDoctorReport(report)}\n`);
    const warningsFail = args.includes('--strict') && report.checks.some((check) => check.status === 'warn');
    process.exitCode = report.ok && !warningsFail ? 0 : 1;
  }
}
