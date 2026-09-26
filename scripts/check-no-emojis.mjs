// Pre-push gate: brand rule - no emojis anywhere in the tracked source.
//
// Scans every tracked text file for pictographic characters and fails with the
// offending file:line list. Uses `git ls-files` so it only ever looks at what
// is actually committed, which keeps it fast and keeps untracked local scratch
// files out of the result.
//
// Bypass for emergencies only:
//   SKIP_EMOJI_CHECK=1 git push
// Scanner test: EMOJI_TEST_DIR=<path> node scripts/check-no-emojis.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = path.resolve(fileURLToPath(import.meta.url));

if (process.env.SKIP_EMOJI_CHECK) {
  console.log('pre-push: SKIP_EMOJI_CHECK set, skipping emoji check.');
  process.exit(0);
}

const SCAN_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.css', '.html', '.json', '.yml', '.yaml', '.md', '.mmd', '.sh', '.conf',
]);

// Vendored trees and build output never carry project-authored prose.
const SKIP_PREFIXES = [
  'node_modules/',
  'dist/',
  'build/',
  'docs/telnyx/upstream/',
  'docs/typesafe/',
  'docs/xstate/upstream/',
  'frontend/public/fonts/',
  'railcode/frontend/public/fonts/',
];

// Copyright, registered and trademark symbols are not emojis.
const EMOJI_REGEX = /(?!\u00A9|\u00AE|\u2122)\p{Extended_Pictographic}/u;

function trackedTextFiles() {
  if (process.env.EMOJI_TEST_DIR !== undefined) {
    const target = path.resolve(process.env.EMOJI_TEST_DIR);
    try {
      return statSync(target).isFile() ? [target] : [target];
    } catch {
      return [];
    }
  }
  let listed;
  try {
    listed = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    console.error('pre-push: could not run git ls-files, skipping emoji check.');
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
const files = trackedTextFiles();

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
    if (EMOJI_REGEX.test(line)) violations.push(`${rel}:${i + 1}: ${line.trim()}`);
  });
}

if (violations.length > 0) {
  console.error('pre-push: FAIL - emoji usage found (strict rule: no emojis allowed anywhere).');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error('Remove the emoji and replace it with plain descriptive text.');
  process.exit(1);
}

console.log(`pre-push: OK - no emoji usage found in ${files.length} tracked files.`);
