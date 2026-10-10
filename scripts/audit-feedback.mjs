// Audit: how every CRUD action in the SPA reports its outcome.
//
// Walks frontend/src with the TypeScript AST and lists, per file:
//   - writes: every api.<resource>.<write>() call and how a failure is handled
//     (try/catch, .catch, a useMutation onError, or nothing)
//   - mutations: every useMutation / useOptimistic* hook and whether it has
//     onError, plus mutateAsync() call sites that are not awaited in a try
//   - toasts: every success / error / warning / info call and its title
//   - silent: catch blocks and .catch handlers that drop the error
//
//   node scripts/audit-feedback.mjs            human summary
//   node scripts/audit-feedback.mjs --json     full JSON
//   node scripts/audit-feedback.mjs --check    exit 1 on unhandled writes
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'frontend', 'package.json'));
const ts = require('typescript');

const WRITE = /^(create|update|delete|remove|claim|release|heartbeat|setState|record|reconcile|analyze|logWebsiteSent|ensureOffer|send|note|import|bulk\w*|upsert|patch|hangup|end|open|dial)$/;
const TOAST_FNS = new Set(['success', 'error', 'warning', 'info', 'toastError', 'toastWarning', 'toastSuccess', 'toastInfo']);

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'frontend/src'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(tsx?)$/.test(f) && !/\.test\.tsx?$/.test(f));

const report = { writes: [], mutations: [], mutateAsync: [], toasts: [], silent: [] };

const text = (sf, n) => n.getText(sf).replace(/\s+/g, ' ');
const line = (sf, n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;

function enclosing(node, pred) {
  for (let p = node.parent; p; p = p.parent) if (pred(p)) return p;
  return null;
}

/** How a failure of this call is handled, looking outward from the call. */
function handling(node) {
  for (let child = node, p = node.parent; p; child = p, p = p.parent) {
    if (ts.isTryStatement(p) && p.tryBlock === child && p.catchClause) return 'try/catch';
    if (ts.isPropertyAccessExpression(p) && p.name.text === 'catch' && p.expression === child) return '.catch';
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === 'then' && p.arguments.length > 1) return '.then(_, onError)';
    if (ts.isPropertyAssignment(p) && p.name.getText() === 'mutationFn') return 'useMutation';
    // Passed as the save function to a useOptimistic* hook: the hook rolls back; callers decide on toasts.
    if (ts.isCallExpression(p) && /^useOptimistic/.test(p.expression.getText())) return 'useOptimistic (rollback)';
    if (ts.isCallExpression(p) && /^(queryFn|useQuery)$/.test(p.expression.getText())) return 'query';
    if (ts.isAwaitExpression(p)) {
      const fn = enclosing(p, (q) => ts.isFunctionLike(q));
      // A class method or named function: its callers handle the rejection.
      if (fn && (ts.isMethodDeclaration(fn) || ts.isFunctionDeclaration(fn))) return 'awaited (caller handles)';
    }
    if (ts.isPropertyAssignment(p) && p.name.getText() === 'queryFn') return 'query';
    if (ts.isFunctionLike(p)) {
      // Returned from a function: the caller owns the error. Report the caller boundary.
      const ret = enclosing(node, (q) => ts.isReturnStatement(q) || q === p);
      if (ret && ts.isReturnStatement(ret)) return 'returned to caller';
      if (ts.isArrowFunction(p) && p.body === child) return 'returned to caller';
    }
  }
  return 'NONE';
}

function isSilentCatch(sf, node) {
  if (ts.isCatchClause(node)) {
    const stmts = node.block.statements;
    if (stmts.length === 0) return 'empty catch';
    return null;
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'catch') {
    const fn = node.arguments[0];
    if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
      const b = fn.body;
      if (ts.isBlock(b) && b.statements.length === 0) return '.catch(() => {})';
    }
  }
  return null;
}

// Shared hooks whose useMutation has no onError: every .mutate() on them must pass one.
const bareHooks = new Set();

for (const rel of files) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const short = rel.replace(/^frontend\/src\//, '');
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      // api.<resource>.<write>(...)
      const m = /^api\.(\w+)\.(\w+)$/.exec(callee);
      if (m && WRITE.test(m[2])) {
        report.writes.push({ file: short, line: line(sf, node), call: `api.${m[1]}.${m[2]}`, handled: handling(node) });
      }
      // useMutation({...}) / useOptimisticUpdate(...)
      if (/^(useMutation|useOptimisticUpdate|useOptimisticDelete)$/.test(callee)) {
        const opts = node.arguments[0];
        const hasOnError = !!(opts && ts.isObjectLiteralExpression(opts) && opts.properties.some((p) => p.name?.getText(sf) === 'onError'));
        const owner = enclosing(node, (p) => ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p));
        report.mutations.push({ file: short, line: line(sf, node), kind: callee, onError: hasOnError, in: owner?.name?.getText(sf) ?? '?' });
        if (!hasOnError && callee === 'useMutation' && owner?.name) bareHooks.add(owner.name.getText(sf));
      }
      // x.mutateAsync(...) must sit in a try or have .catch
      if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'mutateAsync') {
        report.mutateAsync.push({ file: short, line: line(sf, node), call: text(sf, node.expression), handled: handling(node) });
      }
      // toasts
      if (ts.isIdentifier(node.expression) && TOAST_FNS.has(node.expression.text) && node.arguments.length >= 1) {
        const kind = node.expression.text.replace(/^toast/, '').toLowerCase();
        report.toasts.push({ file: short, line: line(sf, node), kind, title: text(sf, node.arguments[0]).slice(0, 80), detail: node.arguments[1] ? text(sf, node.arguments[1]).slice(0, 100) : '' });
      }
    }
    const silent = isSilentCatch(sf, node);
    if (silent) {
      const ctx = enclosing(node, (p) => ts.isExpressionStatement(p) || ts.isTryStatement(p));
      const around = ctx ? text(sf, ctx) : '';
      report.silent.push({ file: short, line: line(sf, node), kind: silent, around: around.slice(0, 110), api: /\bapi\.\w+\.\w+\(/.test(around) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// Second pass: .mutate() call sites of bare hooks.
report.bareMutate = [];
for (const rel of files) {
  const src = readFileSync(path.join(ROOT, rel), 'utf8');
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const vars = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && ts.isCallExpression(node.initializer) && ts.isIdentifier(node.name)) {
      const hook = node.initializer.expression.getText(sf);
      if (bareHooks.has(hook)) vars.set(node.name.text, hook);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'mutate') {
      const recv = node.expression.expression.getText(sf);
      const hook = vars.get(recv);
      const opts = node.arguments[1];
      const hasOnError = !!(opts && ts.isObjectLiteralExpression(opts) && opts.properties.some((p) => p.name?.getText(sf) === 'onError'));
      if (hook && !hasOnError) report.bareMutate.push({ file: rel.replace(/^frontend\/src\//, ''), line: line(sf, node), call: `${recv}.mutate`, hook });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// The map: docs/feedback-map.md, generated between markers.
function markdown() {
  const rows = (list, cols) => list.map((r) => `| ${cols.map((c) => String(c(r)).replace(/\|/g, '\\|')).join(' | ')} |`).join('\n');
  const out = [];
  out.push(`Generated by \`node scripts/audit-feedback.mjs --write\`. Do not edit by hand.`, '');
  out.push(`### Toasts (${report.toasts.length})`, '', '| Kind | Title | Where |', '|---|---|---|');
  out.push(rows([...report.toasts].sort((x, y) => x.kind.localeCompare(y.kind) || x.title.localeCompare(y.title)), [(t) => t.kind, (t) => t.title.replace(/^["'`]|["'`]$/g, ''), (t) => `\`${t.file}:${t.line}\``]));
  out.push('', `### API writes and how a failure is handled (${report.writes.length})`, '', '| Call | Failure handling | Where |', '|---|---|---|');
  out.push(rows([...report.writes].sort((x, y) => x.call.localeCompare(y.call)), [(w) => `\`${w.call}\``, (w) => w.handled, (w) => `\`${w.file}:${w.line}\``]));
  out.push('', `### Errors dropped on purpose (${report.silent.length})`, '', 'Browser storage, SIP teardown and unload keepalives, where nothing can be done and nothing is lost.', '', '| Kind | Where | Code |', '|---|---|---|');
  out.push(rows(report.silent, [(x) => x.kind, (x) => `\`${x.file}:${x.line}\``, (x) => x.around.slice(0, 70).replace(/\`/g, "'")]));
  return out.join('\n');
}

const BEGIN = '<!-- feedback-map:begin -->';
const END = '<!-- feedback-map:end -->';
const DOC = path.join(ROOT, 'docs', 'feedback-map.md');
if (process.argv.includes('--write') || process.argv.includes('--check')) {
  const { writeFileSync, existsSync } = await import('node:fs');
  const doc = existsSync(DOC) ? readFileSync(DOC, 'utf8') : '';
  const i = doc.indexOf(BEGIN);
  const j = doc.indexOf(END);
  const fresh = i >= 0 && j > i ? `${doc.slice(0, i + BEGIN.length)}\n${markdown()}\n${doc.slice(j)}` : doc;
  if (process.argv.includes('--write')) {
    writeFileSync(DOC, fresh);
    console.log('docs/feedback-map.md updated');
  } else if (fresh.replace(/\r\n/g, '\n') !== doc.replace(/\r\n/g, '\n')) {
    console.error('pre-push: FAIL - docs/feedback-map.md is out of date. Run: node scripts/audit-feedback.mjs --write');
    process.exitCode = 1;
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const unhandled = report.writes.filter((w) => w.handled === 'NONE');
const noOnError = report.mutations.filter((m) => !m.onError && m.kind === 'useMutation');
const looseAsync = report.mutateAsync.filter((m) => m.handled === 'NONE');
console.log(`writes: ${report.writes.length} (${unhandled.length} with no failure handling)`);
for (const w of unhandled) console.log(`  NONE  ${w.file}:${w.line}  ${w.call}`);
console.log(`useMutation without onError: ${noOnError.length}`);
for (const m of noOnError) console.log(`  ${m.file}:${m.line}  in ${m.in}`);
console.log(`mutateAsync not in try/.catch: ${looseAsync.length}`);
for (const m of looseAsync) console.log(`  ${m.file}:${m.line}  ${m.call}`);
console.log(`silent catches: ${report.silent.length}`);
console.log(`toasts: ${report.toasts.length} (${['success', 'error', 'warning', 'info'].map((k) => `${k} ${report.toasts.filter((t) => t.kind === k).length}`).join(', ')})`);

const silentApi = report.silent.filter((x) => x.api);
console.log(`.mutate() on a hook with no onError, without one: ${report.bareMutate.length}`);
for (const m of report.bareMutate) console.log(`  ${m.file}:${m.line}  ${m.call} (${m.hook})`);
console.log(`API errors dropped silently: ${silentApi.length}`);
for (const x of silentApi) console.log(`  ${x.file}:${x.line}  ${x.around.slice(0, 90)}`);
const generic = report.toasts.filter((t) => /^"(Error|Sync error|Something went wrong)"$/.test(t.title));
console.log(`toasts titled only "Error": ${generic.length}`);
for (const t of generic) console.log(`  ${t.file}:${t.line}`);

if (process.argv.includes('--check') && (unhandled.length || looseAsync.length || report.bareMutate.length || silentApi.length || generic.length)) {
  console.error('pre-push: FAIL - an action can fail without telling anyone (see above, and docs/feedback-map.md).');
  process.exit(1);
}
if (process.argv.includes('--check') && !process.exitCode) console.log('pre-push: OK - every CRUD action reports its failure.');
