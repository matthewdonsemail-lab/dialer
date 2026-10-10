// Pre-push gate: design rule - corners are rounded-md, never fully round.
//
// Pills, dots, avatars, buttons and bars all use the medium radius
// (`rounded-md` / var(--ods-radius-md)) so shapes stay uniform across the
// app. Scans every tracked source and style file for fully-rounded corners:
// the Tailwind `rounded-full` class (any side: rounded-t-full, ...), arbitrary
// `rounded-[9999px]` / `rounded-[50%]` values, and CSS or inline-style
// border radii of 9999px, 50% or 100%. Fails with the offending file:line list.
//
// Bypass for emergencies only:
//   SKIP_ROUNDED_CHECK=1 git push
// Scanner test: ROUNDED_TEST_FILE=<file> node scripts/check-no-rounded-full.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = path.resolve(fileURLToPath(import.meta.url));

if (process.env.SKIP_ROUNDED_CHECK) {
  console.log('pre-push: SKIP_ROUNDED_CHECK set, skipping rounded-full check.');
  process.exit(0);
}

const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss', '.html', '.vue', '.svelte']);

// Vendored trees and build output are not ours to restyle.
const SKIP_PREFIXES = ['node_modules/', 'dist/', 'build/', 'docs/', 'frontend/public/', 'railcode/frontend/public/'];

const RULES = [
  /\brounded(-[trbsexy]{1,2})?-full\b/,
  /\brounded(-[trbsexy]{1,2})?-\[(9999px|50%|100%)\]/,
  /border-radius\s*:\s*(9999px|50%|100%)/i,
  /borderRadius\s*:\s*["'`]?(9999|50%|100%)/,
  /--ods-radius-pill/,
];

function trackedFiles() {
  if (process.env.ROUNDED_TEST_FILE !== undefined) return [path.resolve(process.env.ROUNDED_TEST_FILE)];
  let listed;
  try {
    listed = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    console.error('pre-push: could not run git ls-files, skipping rounded-full check.');
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
    if (RULES.some((rule) => rule.test(line))) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error('pre-push: FAIL - fully rounded corners found (strict rule: use rounded-md, never rounded-full).');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error('Replace it with rounded-md (or var(--ods-radius-md) in CSS).');
  process.exit(1);
}

console.log(`pre-push: OK - no fully rounded corners found in ${files.length} tracked files.`);
