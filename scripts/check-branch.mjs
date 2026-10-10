// pre-commit: work happens on a named branch, never straight on main.
//
//   <type>/<short-kebab-name>   e.g. feat/contact-dialer-page, fix/pin-state
//   types: feat fix docs refactor perf test build ci chore style hotfix
//          release integrate resolve
//   tbd-sync (the issue tracker's own branch) is allowed as is.
//
// Bypass for emergencies only: ALLOW_MAIN_COMMIT=1 (main), SKIP_BRANCH_CHECK=1
import { execFileSync } from 'node:child_process';

if (process.env.SKIP_BRANCH_CHECK) process.exit(0);

let branch = '';
try {
  branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  process.exit(0); // no commits yet
}
if (branch === 'HEAD') process.exit(0); // detached (rebase, bisect)

if ((branch === 'main' || branch === 'master') && !process.env.ALLOW_MAIN_COMMIT) {
  console.error(`branch: FAIL - committing straight to ${branch}. Create a branch: git switch -c feat/<what-it-does>`);
  process.exit(1);
}
const TYPES = ['feat', 'fix', 'docs', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'style', 'hotfix', 'release', 'integrate', 'resolve'];
const ok = branch === 'main' || branch === 'master' || branch === 'tbd-sync' || new RegExp(`^(${TYPES.join('|')})/[a-z0-9][a-z0-9.-]*$`).test(branch);
if (!ok) {
  console.error(`branch: FAIL - "${branch}" should be <type>/<short-kebab-name>, with type one of ${TYPES.join(', ')}.`);
  console.error(`  rename it: git branch -m ${branch} feat/<what-it-does>`);
  process.exit(1);
}
