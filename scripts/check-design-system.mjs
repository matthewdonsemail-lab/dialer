// Pre-push gate: the design system (docs/design-system.md).
//
// Strict for code built on the primitives (frontend/src/domains,
// frontend/src/primitives): no native <select>, no uppercase-tracking
// labels, radius and font size only from the scale, no hand-built button
// classes (use Button / buttonClass). App-wide: no native <select> and no
// uppercase-tracking labels anywhere in frontend/src.
//
// Bypass for emergencies only:
//   SKIP_DESIGN_CHECK=1 git push
// Scanner test: DESIGN_TEST_FILE=<file> node scripts/check-design-system.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.env.SKIP_DESIGN_CHECK) {
  console.log('pre-push: SKIP_DESIGN_CHECK set, skipping design-system check.');
  process.exit(0);
}

const STRICT = ['frontend/src/domains/', 'frontend/src/primitives/'];
const APP = 'frontend/src/';

const RADIUS_OK = new Set(['8', '10', '12']);
const TEXT_OK = new Set(['12', '13', '14', '15']);

const APP_RULES = [
  { re: /<select[\s>]/, why: 'native <select>: use SelectMenu (@/components/ui/Menu)' },
  { re: /\buppercase\b[^"'`]*\btracking-/, why: 'uppercase-tracking label: labels are 12px semibold sentence case (LABEL)' },
  // Chrome 121+ ignores every ::-webkit-scrollbar rule on an element with
  // scrollbar-width/-color, which brings horizontal scrollbars back.
  {
    re: /scrollbar-(width|color)|scrollbar(Width|Color)/,
    why: 'scrollbar-width/-color in a component: it disables the global no-horizontal-scrollbar rule (index.css owns scrollbars)',
    tsxOnly: true,
  },
];

const STRICT_RULES = [
  {
    re: /\brounded-\[(\d+)px\]/g,
    test: (m) => !RADIUS_OK.has(m[1]),
    why: (m) => `radius ${m[0]}: use rounded-md, rounded-[8px], rounded-[10px] or rounded-[12px] (RADIUS)`,
  },
  {
    re: /\brounded-(sm|lg|xl|2xl|3xl)\b/g,
    test: () => true,
    why: (m) => `radius ${m[0]}: use the RADIUS scale`,
  },
  {
    re: /\btext-\[(\d+)px\]/g,
    test: (m) => !TEXT_OK.has(m[1]),
    why: (m) => `font size ${m[0]}: use 12, 13, 14 or 15px, or text-xl (TEXT)`,
  },
  {
    re: /\btext-(xs|sm|base|lg)\b/g,
    test: () => true,
    why: (m) => `font size ${m[0]}: use the TEXT scale`,
  },
  {
    re: /<button\b[^>]*className=["'`{][^>]*\bh-(8|9|10|11)\b[^>]*\bpx-\d/g,
    test: () => true,
    why: () => 'hand-built button: use <Button> or buttonClass() from @/primitives',
  },
];

function files() {
  if (process.env.DESIGN_TEST_FILE !== undefined) return [process.env.DESIGN_TEST_FILE.replace(/\\/g, '/')];
  let listed;
  try {
    listed = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', APP], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    console.error('pre-push: could not run git ls-files, skipping design-system check.');
    process.exit(0);
  }
  return listed
    .split('\n')
    .filter(Boolean)
    .map((rel) => rel.replace(/\\/g, '/'))
    .filter((rel) => /\.(tsx?|css)$/.test(rel));
}

const violations = [];
for (const rel of files()) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch {
    continue; // deleted in the working tree
  }
  const strict = process.env.DESIGN_TEST_FILE !== undefined || STRICT.some((p) => rel.startsWith(p));
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of APP_RULES) {
      if (rule.tsxOnly && !rel.endsWith('.tsx')) continue;
      if (rule.re.test(line)) violations.push(`${rel}:${i + 1}  ${rule.why}`);
    }
    if (!strict) return;
    for (const rule of STRICT_RULES) {
      for (const m of line.matchAll(rule.re)) if (rule.test(m)) violations.push(`${rel}:${i + 1}  ${rule.why(m)}`);
    }
  });
}

if (violations.length) {
  console.error('pre-push: FAIL - design system (docs/design-system.md):');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('pre-push: OK - design system rules hold in frontend/src (strict in domains/ and primitives/).');
