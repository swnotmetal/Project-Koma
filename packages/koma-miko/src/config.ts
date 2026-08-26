import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createMiko } from './index.js';
import type { MikoContract } from './index.js';

export interface MikoAgentSpecConfig {
  $schema?: string;
  version: 1;
  specs: MikoContract[];
}

export interface LoadedMikoConfig {
  path: string;
  format: 'agent-spec' | 'legacy-contract-array';
  contracts: MikoContract[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseMikoConfig(value: unknown, pathname = 'miko.json'): LoadedMikoConfig {
  let format: LoadedMikoConfig['format'];
  let contracts: MikoContract[];

  if (Array.isArray(value)) {
    format = 'legacy-contract-array';
    contracts = value as MikoContract[];
  } else if (isRecord(value) && value.version === 1 && Array.isArray(value.specs)) {
    const allowedKeys = new Set(['$schema', 'version', 'specs']);
    const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
    if (unknownKey) throw new Error(`Unknown miko.json property: ${unknownKey}`);
    if (value.$schema !== undefined && typeof value.$schema !== 'string') {
      throw new Error('miko.json $schema must be a string.');
    }
    if (value.specs.length === 0) throw new Error('miko.json specs must not be empty.');
    format = 'agent-spec';
    contracts = value.specs as MikoContract[];
  } else {
    throw new Error('Expected { "version": 1, "specs": [...] } or a legacy contract array.');
  }

  // createMiko is the single runtime schema validator used by both library and CLI.
  createMiko({ contracts });
  return { path: pathname, format, contracts };
}

export function resolveMikoConfigPath(projectRoot: string, explicitPath?: string): string {
  if (explicitPath) return path.resolve(projectRoot, explicitPath);
  const agentSpecPath = path.join(projectRoot, 'miko.json');
  if (existsSync(agentSpecPath)) return agentSpecPath;
  const legacyPath = path.join(projectRoot, '.miko', 'contracts.json');
  if (existsSync(legacyPath)) return legacyPath;
  return agentSpecPath;
}

export function loadMikoConfig(projectRoot: string, explicitPath?: string): LoadedMikoConfig {
  const pathname = resolveMikoConfigPath(projectRoot, explicitPath);
  const parsed = JSON.parse(readFileSync(pathname, 'utf8')) as unknown;
  return parseMikoConfig(parsed, pathname);
}
