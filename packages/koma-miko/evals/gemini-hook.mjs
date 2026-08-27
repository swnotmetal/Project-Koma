import { runConformance } from './hook-conformance.mjs';

runConformance('gemini')
  .then((report) => console.log(JSON.stringify({ status: 'PASS', ...report }, null, 2)))
  .catch((error) => {
    console.error(`koma-miko Gemini hook eval failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
