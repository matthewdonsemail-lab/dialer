// Code rules, checked on the TypeScript AST (docs/naming-conventions.md,
// docs/design-system.md, docs/feedback-map.md).
//
//   naming            every folder and file under frontend/src, backend/src and
//                     packages/shared/src is camelCase
//   layout            frontend code lives at domains/<domain>/<primitive>/<file>,
//                     every primitive folder has an index.ts, and other
//                     modules import it through that index, not a file inside
//   dead-button       a <button>/<Button> with no onClick that is not a submit
//                     button, an empty onClick, or an <a> with no href
//   toggle-state      a button whose look depends on state (a ternary in its
//                     className) must expose that state: aria-pressed,
//                     aria-selected, aria-expanded, aria-current or role="tab"
//   pipeline-literal  a status / outboundLabel / videoStatus / coldCallStatus
//                     written to the API as a hard-coded string instead of a
//                     value from the shared pipelines
//
//   node scripts/check-code.mjs            every file
//   node scripts/check-code.mjs --staged   staged files only (pre-commit)
//   CODE_TEST_FILE=<file> node scripts/check-code.mjs
// Bypass for emergencies only: SKIP_CODE_CHECK=1
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'frontend', 'package.json'));
const ts = require('typescript');

if (process.env.SKIP_CODE_CHECK) {
  console.log('SKIP_CODE_CHECK set, skipping code check.');
  process.exit(0);
}

const ROOTS = ['frontend/src/', 'backend/src/', 'packages/shared/src/'];
const FRONTEND_ROOT_FILES = new Set(['frontend/src/main.tsx', 'frontend/src/app.tsx', 'frontend/src/index.css', 'frontend/src/vite-env.d.ts']);
const NAMING_EXEMPT = [/\/generated\//, /vite-env\.d\.ts$/];
const CAMEL_DIR = /^[a-z][a-zA-Z0-9]*$/;
const CAMEL_FILE = /^[a-z][a-zA-Z0-9]*(\.(test|d))?\.(ts|tsx|css)$/;
const PIPELINE_KEYS = new Set(['status', 'outboundLabel', 'videoStatus', 'coldCallStatus', 'disposition']);

function listFiles() {
  if (process.env.CODE_TEST_FILE) return [process.env.CODE_TEST_FILE.replace(/\\/g, '/')];
  const args = process.argv.includes('--staged')
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR']
    : ['ls-files', '--cached', '--others', '--exclude-standard'];
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim().replace(/\\/g, '/'))
    .filter((f) => f && ROOTS.some((r) => f.startsWith(r)) && /\.(tsx?|css)$/.test(f));
}

const violations = [];
const report = (rel, line, rule, why) => violations.push(`${rel}:${line}  [${rule}] ${why}`);

for (const rel of listFiles()) {
  const abs = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const testMode = !!process.env.CODE_TEST_FILE;
  const isFrontend = rel.startsWith('frontend/src/') || testMode;

  // ---- naming ----
  if (!testMode && !NAMING_EXEMPT.some((re) => re.test(rel))) {
    const root = ROOTS.find((r) => rel.startsWith(r));
    const parts = rel.slice(root.length).split('/');
    const file = parts.pop();
    for (const dir of parts) if (!CAMEL_DIR.test(dir)) report(rel, 1, 'naming', `folder "${dir}" is not camelCase`);
    if (!CAMEL_FILE.test(file)) report(rel, 1, 'naming', `file "${file}" is not camelCase`);
  }

  // ---- layout (frontend) ----
  if (isFrontend && !testMode && !FRONTEND_ROOT_FILES.has(rel)) {
    const m = /^frontend\/src\/domains\/[^/]+\/[^/]+\/[^/]+$/.exec(rel);
    if (!m) report(rel, 1, 'layout', 'frontend code lives at src/domains/<domain>/<primitive>/<file>');
    else if (!existsSync(path.join(path.dirname(abs), 'index.ts'))) report(rel, 1, 'layout', 'this primitive folder has no index.ts');
  }
  if (rel.endsWith('.css')) continue;

  const text = readFileSync(abs, 'utf8');
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const myModule = /^frontend\/src\/(domains\/[^/]+\/[^/]+)\//.exec(rel)?.[1];

  const attrs = (el) => {
    const map = new Map();
    for (const a of el.attributes.properties) {
      if (ts.isJsxAttribute(a)) map.set(a.name.getText(sf), a.initializer ?? true);
      if (ts.isJsxSpreadAttribute(a)) map.set('...', true);
    }
    return map;
  };
  const isEmptyFn = (init) => {
    const expr = init && init !== true && ts.isJsxExpression(init) ? init.expression : null;
    return !!expr && (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) && ts.isBlock(expr.body) && expr.body.statements.length === 0;
  };
  const hasTernaryClass = (init) => {
    if (!init || init === true || !ts.isJsxExpression(init) || !init.expression) return false;
    let found = false;
    const walk = (n) => {
      if (ts.isConditionalExpression(n)) found = true;
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) found = true;
      ts.forEachChild(n, walk);
    };
    walk(init.expression);
    return found;
  };

  const visit = (node) => {
    // ---- layout: no deep imports into another module ----
    if (isFrontend && (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const deep = /^@\/(domains\/[^/]+\/[^/]+)\/(.+)$/.exec(spec);
      if (deep && deep[1] !== myModule) report(rel, lineOf(node), 'layout', `import "${spec}" reaches inside another module; import "@/${deep[1]}"`);
    }

    // ---- JSX rules ----
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(sf);
      const a = attrs(node);
      if ((tag === 'button' || tag === 'Button') && !a.has('...')) {
        const type = a.get('type');
        const typeText = type && type !== true ? type.getText(sf).replace(/["'{}]/g, '') : '';
        const isSubmit = typeText === 'submit' || (tag === 'button' && !type && false);
        if (!a.has('onClick') && !isSubmit && !a.has('form') && a.get('disabled') === undefined) {
          report(rel, lineOf(node), 'dead-button', `<${tag}> has no onClick and is not a submit button: it does nothing`);
        }
        if (isEmptyFn(a.get('onClick'))) report(rel, lineOf(node), 'dead-button', `<${tag}> onClick does nothing`);
        const exposes = ['aria-pressed', 'aria-selected', 'aria-expanded', 'aria-current', 'aria-checked', 'pressed'].some((k) => a.has(k)) || (a.get('role') && a.get('role') !== true && /tab|option|switch/.test(a.get('role').getText(sf)));
        if (hasTernaryClass(a.get('className')) && !exposes) {
          report(rel, lineOf(node), 'toggle-state', `<${tag}> changes its look with state but does not expose it (aria-pressed / aria-selected / aria-expanded / aria-current, or Button pressed)`);
        }
      }
      if (tag === 'a' && !a.has('href') && !a.has('...')) report(rel, lineOf(node), 'dead-button', '<a> has no href: use a Button for actions');
    }

    // ---- pipeline literals written to the API ----
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      const isWrite = /^api\.\w+\.(create|update)$/.test(callee) || /^(updateTwenty|createTwenty)$/.test(callee);
      if (isWrite) {
        for (const arg of node.arguments) {
          if (!ts.isObjectLiteralExpression(arg)) continue;
          for (const p of arg.properties) {
            if (ts.isPropertyAssignment(p) && PIPELINE_KEYS.has(p.name.getText(sf)) && ts.isStringLiteral(p.initializer)) {
              const ok = callee.startsWith('api.calls') && ['IN_PROGRESS'].includes(p.initializer.text);
              if (!ok) report(rel, lineOf(p), 'pipeline-literal', `${p.name.getText(sf)}: "${p.initializer.text}" is hard-coded; take it from the shared pipeline (@dialer/shared) so both sides agree`);
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

if (violations.length) {
  console.error(`FAIL - code rules (${violations.length}):`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log('OK - code rules hold (naming, layout, dead buttons, toggle state, pipeline literals).');
