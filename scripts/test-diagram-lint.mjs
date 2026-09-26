// Regression test: inject each Mermaid footgun the linter claims to catch and
// confirm scripts/check-docs.mjs rejects it. Run from the repo root.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const CASES = [
  {
    name: 'semicolon in a sequenceDiagram message',
    file: 'docs/diagrams/call-lifecycle.mmd',
    from: 'best effort, a failure only warns',
    to: 'best effort; a failure only warns',
    expect: 'terminates a statement',
  },
  {
    name: 'bare %% line',
    file: 'docs/diagrams/system-context.mmd',
    from: '%% Source of truth for the component boundaries. See docs/architecture.md.',
    to: '%%\n%% Source of truth for the component boundaries. See docs/architecture.md.',
    expect: 'bare "%%" line',
  },
  {
    name: 'subgraph id["label"] with no space',
    file: 'docs/diagrams/data-flow.mmd',
    from: 'subgraph read ["Read path"]',
    to: 'subgraph read["Read path"]',
    expect: 'subgraph needs a space',
  },
  {
    name: 'unquoted subgraph label with parentheses',
    file: 'docs/diagrams/system-context.mmd',
    from: 'subgraph twenty ["Twenty CRM (system of record)"]',
    to: 'subgraph twenty [Twenty CRM (system of record)]',
    expect: 'unquoted subgraph label',
  },
  {
    name: 'missing diagram type declaration',
    file: 'docs/diagrams/phone-claim.mmd',
    from: 'stateDiagram-v2',
    to: 'notADiagramType',
    expect: 'must declare a diagram type',
  },
  {
    name: 'unbalanced block braces',
    file: 'docs/diagrams/data-model.mmd',
    from: '    agencyOffers {',
    to: '    agencyOffers',
    expect: 'unbalanced block braces',
  },
];

function run(args) {
  try {
    return { ok: true, output: execFileSync('node', args, { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const check = () => run(['scripts/check-docs.mjs']);
const fix = () => run(['scripts/check-docs.mjs', '--fix']);

// Keep the README embeds in sync first, so the drift check cannot be what
// catches an injection. Only the targeted rule may fire.
fix();

let passed = 0;
for (const testCase of CASES) {
  const original = fs.readFileSync(testCase.file, 'utf8');
  if (!original.includes(testCase.from)) {
    console.log(`  SKIP  ${testCase.name} (anchor not found)`);
    continue;
  }
  fs.writeFileSync(testCase.file, original.replace(testCase.from, testCase.to), 'utf8');
  const { ok, output } = check();
  fs.writeFileSync(testCase.file, original, 'utf8');
  fix();

  if (ok) {
    console.log(`  MISS  ${testCase.name} - the rule did not fire`);
    continue;
  }
  if (!output.includes(testCase.expect)) {
    console.log(`  MISS  ${testCase.name} - fired, but not from the expected rule`);
    console.log(output.split('\n').filter((l) => l.includes('.mmd')).map((l) => `          ${l.trim()}`).join('\n'));
    continue;
  }
  passed += 1;
  const line = output.split('\n').find((l) => l.includes(testCase.expect));
  console.log(`  ok    ${testCase.name}`);
  if (line) console.log(`          ${line.trim().replace(/^-\s*/, '')}`);
}

console.log(`\n${passed}/${CASES.length} footguns correctly rejected by their own rule.`);
process.exitCode = passed === CASES.length ? 0 : 1;
