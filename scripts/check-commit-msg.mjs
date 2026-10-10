// commit-msg hook: Conventional Commits, so the history reads as a changelog.
//
//   type(scope): subject          scope optional, ! for breaking changes
//   types: feat fix docs style refactor perf test build ci chore revert
//   subject: starts lower case, no trailing period, header at most 72 chars
//
// Merge commits and git's own fixup!/squash!/revert messages pass untouched.
// Bypass for emergencies only: SKIP_COMMIT_MSG_CHECK=1
import { readFileSync } from 'node:fs';

if (process.env.SKIP_COMMIT_MSG_CHECK) process.exit(0);

const file = process.argv[2];
if (!file) {
  console.error('usage: check-commit-msg.mjs <commit message file>');
  process.exit(2);
}
const lines = readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter((l) => !l.startsWith('#'));
const header = (lines[0] ?? '').trim();

if (/^(Merge |Revert "|fixup! |squash! |amend! )/.test(header)) process.exit(0);

const TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const re = new RegExp(`^(${TYPES.join('|')})(\\([a-z0-9][a-z0-9,-]*\\))?!?: (.+)$`);
const problems = [];
const m = re.exec(header);
if (!m) problems.push(`the first line must be "type(scope): subject" with type one of ${TYPES.join(', ')}`);
else {
  const subject = m[3];
  if (/^[A-Z]/.test(subject) && !/^[A-Z]{2,}/.test(subject)) problems.push('start the subject in lower case (acronyms are fine)');
  if (/\.$/.test(subject)) problems.push('drop the trailing period from the subject');
}
if (header.length > 72) problems.push(`keep the first line to 72 characters (it is ${header.length})`);
if (lines.length > 1 && lines[1].trim() !== '') problems.push('leave a blank line after the first line');

if (problems.length) {
  console.error(`commit-msg: FAIL - "${header}"`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('  e.g. "fix(dialer): show the pinned state on the pin button"');
  process.exit(1);
}
