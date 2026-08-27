import { runConformance } from './hook-conformance.mjs';

const result = await runConformance('vscode');
console.log(`VS Code Copilot hook conformance: PASS (${result.steps} steps)`);
