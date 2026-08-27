#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DshProbeReport {
  schemaVersion: 1;
  kind: 'dsh-adapter-preflight';
  status: 'READY' | 'FAIL';
  package: string;
  coreDependency: string;
  node: string;
  artifacts: { plugin: boolean; patch: boolean; liveProbe: boolean };
  modelInvoked: false;
  projectModified: false;
  next: string;
  limitation: string;
}

function packageRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function createDshProbeReport(root = packageRoot()): DshProbeReport {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
  };
  const artifacts = {
    plugin: existsSync(path.join(root, 'dist', 'index.js')),
    patch: existsSync(path.join(root, 'cordis.patch.yml')),
    liveProbe: existsSync(path.join(root, 'evals', 'live.mjs')),
  };
  const ready = Object.values(artifacts).every(Boolean);
  return {
    schemaVersion: 1,
    kind: 'dsh-adapter-preflight',
    status: ready ? 'READY' : 'FAIL',
    package: `${manifest.name}@${manifest.version}`,
    coreDependency: manifest.dependencies?.['koma-miko'] ?? 'missing',
    node: process.versions.node,
    artifacts,
    modelInvoked: false,
    projectModified: false,
    next: 'Run the same command with --live only when a bounded model-backed DSH session is intended.',
    limitation: 'Package preflight only; use --live for the disposable end-to-end Harness probe.',
  };
}

export function formatDshProbeReport(report: DshProbeReport): string {
  const mark = report.status === 'READY' ? 'OK' : 'FAIL';
  return [
    `Miko DSH probe - ${report.status}`,
    `[${mark}] plugin entry: ${report.artifacts.plugin ? 'present' : 'missing'}`,
    `[${mark}] Cordis patch: ${report.artifacts.patch ? 'present' : 'missing'}`,
    `[${mark}] bounded live runner: ${report.artifacts.liveProbe ? 'present' : 'missing'}`,
    '[OK] no model or API invoked; current project unchanged',
    `[NOTE] ${report.limitation}`,
  ].join('\n');
}

function help(): string {
  return [
    'koma-miko-dsh probe [--json]',
    'koma-miko-dsh probe --live',
    '',
    'Checks the packaged DSH adapter without invoking a model.',
    'Use --live explicitly for the disposable, budget-capped Harness probe.',
  ].join('\n');
}

function main(): void {
  const args = process.argv.slice(2);
  if (args[0] !== 'probe') {
    process.stdout.write(`${help()}\n`);
    process.exitCode = args.length === 0 || args.includes('--help') ? 0 : 1;
    return;
  }

  if (args.includes('--live')) {
    const live = path.join(packageRoot(), 'evals', 'live.mjs');
    const result = spawnSync(process.execPath, [live], { stdio: 'inherit' });
    if (result.error) {
      process.stderr.write(`Unable to run the live DSH probe: ${result.error.message}\n`);
      process.exitCode = 1;
    } else if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
    }
    return;
  }

  const report = createDshProbeReport();
  process.stdout.write(args.includes('--json')
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatDshProbeReport(report)}\n`);
  if (report.status !== 'READY') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
