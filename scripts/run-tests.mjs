// Runs every unit test in packages/shared, backend and frontend (node:test via
// tsx) and fails if any fails. Used by the pre-push hook and by hand:
//   node scripts/run-tests.mjs
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUITES = [
  ['packages/shared', 'src/**/*.test.ts'],
  ['backend', 'src/**/*.test.ts'],
  ['frontend', 'src/**/*.test.ts'],
];

let failed = false;
for (const [dir, glob] of SUITES) {
  try {
    const out = execFileSync('npx', ['tsx', '--test', glob], { cwd: path.join(ROOT, dir), encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    // node:test prints an information sign (U+2139), then "pass N", in its summary.
    const pass = /\u2139 pass (\d+)/.exec(out)?.[1] ?? '?';
    console.log(`${dir}: ${pass} passed`);
  } catch (err) {
    failed = true;
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    console.error(`${dir}: FAILED`);
    // node:test marks a failure with a heavy multiplication sign (U+2716).
    console.error(out.split('\n').filter((l) => /\u2716|not ok|Error|expected|actual/.test(l)).slice(0, 30).join('\n'));
  }
}
process.exit(failed ? 1 : 0);
