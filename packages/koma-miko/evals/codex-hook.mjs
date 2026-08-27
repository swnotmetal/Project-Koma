import { runConformance } from './hook-conformance.mjs';

runConformance('codex')
  .then((report) => console.log(JSON.stringify({ status: 'PASS', ...report }, null, 2)))
  .catch((error) => {
    console.error(`koma-miko Codex hook eval failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
