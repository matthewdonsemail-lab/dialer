// pre-commit: a dependency change ships with its lockfile, so every machine
// and the deploy install the same versions.
//
// Fails when a staged package.json changes dependencies, devDependencies,
// peerDependencies or optionalDependencies and bun.lock is not staged too.
// Bypass for emergencies only: SKIP_LOCKFILE_CHECK=1
import { execFileSync } from 'node:child_process';

if (process.env.SKIP_LOCKFILE_CHECK) process.exit(0);

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
const manifests = staged.filter((f) => /(^|\/)package\.json$/.test(f));
if (!manifests.length || staged.includes('bun.lock')) process.exit(0);

const DEP_KEYS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const read = (ref, file) => {
  try {
    return JSON.parse(git('show', `${ref}:${file}`));
  } catch {
    return {};
  }
};
const changed = manifests.filter((file) => {
  const before = read('HEAD', file);
  const after = read('', file); // the index
  return DEP_KEYS.some((k) => JSON.stringify(before[k] ?? {}) !== JSON.stringify(after[k] ?? {}));
});
if (changed.length) {
  console.error(`lockfile: FAIL - dependencies changed in ${changed.join(', ')} but bun.lock is not staged. Run bun install, then stage bun.lock.`);
  process.exit(1);
}
