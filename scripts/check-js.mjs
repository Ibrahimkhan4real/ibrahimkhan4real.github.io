import { readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const sourceDirectories = ['assets/js', 'worker/src', 'worker/test', 'tests/smoke'];
const files = sourceDirectories.flatMap((directory) =>
  readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name) === '.js')
    .map((entry) => join(directory, entry.name)),
).concat(['scripts/check-links.mjs', 'playwright.config.js']);

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`JavaScript syntax check passed for ${files.length} files.`);
