import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = process.cwd();
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error('npm_execpath is not set. Run this script through npm run smoke:npm.');
}
const standalonePackages = [
  { name: 'koma-gate', symbol: 'createGeneralKnowledgeGuard' },
  { name: 'koma-scout', symbol: 'createKomaScoutMiddleware' },
  { name: 'koma-core', symbol: 'createKomaStorage' },
  { name: 'koma-miko', symbol: 'createMiko' },
];

const dshPackage = { name: 'koma-miko-dsh', symbol: 'createDshMikoAdapter' };

function runNodeScript(args, cwd) {
  return execFileSync(process.execPath, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
  });
}

function runNpm(args, cwd) {
  return runNodeScript([npmCli, ...args], cwd);
}

function packPackage(packageName) {
  const packageDir = path.join(rootDir, 'packages', packageName);
  const output = runNpm(['pack', '--json', '--silent'], packageDir).trim();
  const meta = JSON.parse(output)[0];
  return path.join(packageDir, meta.filename);
}

function verifyImport(packageName, symbol, cwd) {
  const script = `
    const mod = await import('${packageName}');
    if (typeof mod.${symbol} !== 'function') {
      throw new Error('Missing export: ${symbol}');
    }
  `;
  runNodeScript(['--input-type=module', '-e', script], cwd);
}

function installAndVerify(packageName, tarballPath, symbol) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'koma-smoke-'));
  try {
    runNpm(['init', '-y'], tempDir);
    runNpm(['install', tarballPath, '--silent'], tempDir);
    verifyImport(packageName, symbol, tempDir);
    console.log(`${packageName}: clean install + import OK`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function supportsDshRuntime() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return major >= 24 || (major === 22 && minor >= 19);
}

function installAndVerifyDsh(mikoTarball, adapterTarball) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'koma-dsh-smoke-'));
  const peers = [
    '@deepseek-ai/cordis@4.0.1',
    '@deepseek-ai/dsh-agent@0.1.1-rc.2',
    '@deepseek-ai/dsh-llm@0.1.1-rc.2',
    '@deepseek-ai/dsh-tools@0.1.1-rc.2',
    '@deepseek-ai/schemastery@3.18.1',
  ];

  try {
    runNpm(['init', '-y'], tempDir);
    runNpm(['install', mikoTarball, '--silent'], tempDir);
    runNpm(['install', ...peers, '--silent', '--ignore-scripts'], tempDir);
    runNpm(['install', adapterTarball, '--silent', '--ignore-scripts'], tempDir);
    verifyImport(dshPackage.name, dshPackage.symbol, tempDir);
    console.log(`${dshPackage.name}: clean host install + import OK`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const tarballs = new Map();

try {
  for (const pkg of [...standalonePackages, dshPackage]) {
    tarballs.set(pkg.name, packPackage(pkg.name));
  }

  for (const pkg of standalonePackages) {
    installAndVerify(pkg.name, tarballs.get(pkg.name), pkg.symbol);
  }

  if (supportsDshRuntime()) {
    installAndVerifyDsh(tarballs.get('koma-miko'), tarballs.get(dshPackage.name));
  } else {
    console.log(
      `${dshPackage.name}: runtime smoke skipped on Node ${process.versions.node}; ` +
      'the adapter requires Node ^22.19.0 or >=24.0.0',
    );
  }

  console.log('All supported Koma package smoke tests passed.');
} finally {
  for (const tarballPath of tarballs.values()) {
    rmSync(tarballPath, { force: true });
  }
}
