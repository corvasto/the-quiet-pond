import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.dirname(fileURLToPath(import.meta.url));
// Release validation needs a generated build and remains a separate command.
const checks = readdirSync(directory).filter((name) => /^check-.*\.mjs$/.test(name)
  && name !== 'check-release-build.mjs').sort();
if (!checks.length) throw new Error('No test checks found.');
for (const check of checks) {
  console.log(`\nRunning ${check}`);
  const result = spawnSync(process.execPath, [path.join(directory, check)], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
