import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const rootDir = process.cwd();
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  throw new Error('npm_execpath is not set. Run this script through npm run smoke:npm.');
}
const packages = [
  {
    name: 'koma-gate',
    symbol: 'createGeneralKnowledgeGuard'
  },
  {
    name: 'koma-scout',
    symbol: 'createVibeShieldMiddleware'
  },
  {
    name: 'koma-core',
    symbol: 'createVibeShieldStorage'
  }
];

function runNodeScript(args, cwd) {
  execFileSync(process.execPath, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8'
  });
}

function packPackage(packageDir) {
  const output = execFileSync(process.execPath, [npmCli, 'pack', '--json', '--silent'], {
    cwd: packageDir,
    encoding: 'utf8'
  }).trim();

  const meta = JSON.parse(output)[0];
  return path.join(packageDir, meta.filename);
}

function installAndVerify(packageName, tarballPath, symbol) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'koma-smoke-'));

  try {
    runNodeScript([npmCli, 'init', '-y'], tempDir);
    runNodeScript([npmCli, 'install', tarballPath, '--silent'], tempDir);

    const script = `
      const mod = await import('${packageName}');
      if (typeof mod.${symbol} !== 'function') {
        throw new Error('Missing export: ${symbol}');
      }
      console.log('${packageName}: OK');
    `;

    runNodeScript(['--input-type=module', '-e', script], tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

for (const pkg of packages) {
  const packageDir = path.join(rootDir, 'packages', pkg.name);
  const tarballPath = packPackage(packageDir);
  installAndVerify(pkg.name, tarballPath, pkg.symbol);
}

console.log('All Koma packages passed the clean-install smoke test.');