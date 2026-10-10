// Pre-push gate: brand rule - no monospace type anywhere in the UI.
//
// Phone numbers, IDs and URLs render in the app font (Inter) with
// tabular-nums, never in a code font. Scans every tracked source and style
// file for the Tailwind `font-mono` class and any CSS `monospace` font family
// (including `ui-monospace`), and fails with the offending file:line list.
// Uses `git ls-files` so it only looks at what is actually committed.
//
// Bypass for emergencies only:
//   SKIP_MONOSPACE_CHECK=1 git push
// Scanner test: MONOSPACE_TEST_DIR=<file> node scripts/check-no-monospace.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = path.resolve(fileURLToPath(import.meta.url));

if (process.env.SKIP_MONOSPACE_CHECK) {
  console.log('pre-push: SKIP_MONOSPACE_CHECK set, skipping monospace check.');
  process.exit(0);
}

const SCAN_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.html', '.vue', '.svelte',
]);

// Vendored trees and build output are not ours to restyle.
const SKIP_PREFIXES = [
  'node_modules/',
  'dist/',
  'build/',
  'docs/',
  'frontend/public/',
  'railcode/frontend/public/',
];

const MONO_REGEX = /\bfont-mono\b|monospace/i;

function trackedFiles() {
  if (process.env.MONOSPACE_TEST_DIR !== undefined) return [path.resolve(process.env.MONOSPACE_TEST_DIR)];
  let listed;
  try {
    listed = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    console.error('pre-push: could not run git ls-files, skipping monospace check.');
    process.exit(0);
  }
  return listed
    .split('\n')
    .filter(Boolean)
    .map((rel) => rel.replace(/\\/g, '/'))
    .filter((rel) => !SKIP_PREFIXES.some((prefix) => rel.startsWith(prefix)))
    .filter((rel) => SCAN_EXT.has(path.extname(rel).toLowerCase()))
    .map((rel) => path.join(ROOT, rel));
}

const violations = [];
const files = trackedFiles();

for (const file of files) {
  if (path.resolve(file) === SELF) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  text.split('\n').forEach((line, i) => {
    if (MONO_REGEX.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error('pre-push: FAIL - monospace font found (strict rule: never use font-mono or monospace).');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error('Remove it; use the app font with `tabular-nums` for numbers, IDs and URLs.');
  process.exit(1);
}

console.log(`pre-push: OK - no monospace fonts found in ${files.length} tracked files.`);
