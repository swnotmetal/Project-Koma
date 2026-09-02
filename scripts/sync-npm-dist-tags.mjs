import { execFileSync } from 'node:child_process';

const REQUIRED_TAGS = ['alpha', 'latest'];

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required; run this script through npm publish.`);
  return value;
}

function validateReleaseTarget(packageName, version) {
  if (!/^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(packageName)) {
    throw new Error(`Invalid npm package name: ${packageName}`);
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid npm package version: ${version}`);
  }
}

function npmCommand(npmCli, args, stdio = 'pipe') {
  return execFileSync(process.execPath, [npmCli, ...args], {
    encoding: 'utf8',
    stdio,
  });
}

function readTags(npmCli, packageName) {
  const output = npmCommand(npmCli, [
    '--workspaces=false',
    'view',
    packageName,
    'dist-tags',
    '--json',
    '--prefer-online',
  ]);
  return JSON.parse(output);
}

async function verifyTags(npmCli, packageName, version) {
  let observed = {};
  for (let attempt = 0; attempt < 5; attempt += 1) {
    observed = readTags(npmCli, packageName);
    if (REQUIRED_TAGS.every((tag) => observed[tag] === version)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `npm dist-tag verification failed for ${packageName}@${version}: ${JSON.stringify(observed)}`,
  );
}

const packageName = requiredEnvironment('npm_package_name');
const version = requiredEnvironment('npm_package_version');
const npmCli = requiredEnvironment('npm_execpath');

validateReleaseTarget(packageName, version);

const currentTags = readTags(npmCli, packageName);
for (const tag of REQUIRED_TAGS) {
  if (currentTags[tag] === version) continue;
  npmCommand(
    npmCli,
    ['--workspaces=false', 'dist-tag', 'add', `${packageName}@${version}`, tag],
    'inherit',
  );
}

await verifyTags(npmCli, packageName, version);
console.log(`npm tags verified: ${packageName} alpha/latest -> ${version}`);
