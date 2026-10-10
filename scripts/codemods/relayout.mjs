// Codemod: move every module to <domain>/<primitive>/<camelCaseFile> and
// rewrite every import with the TypeScript AST (docs/naming-conventions.md).
//
//   node scripts/codemods/relayout.mjs frontend --dry   print the plan
//   node scripts/codemods/relayout.mjs frontend         git mv + rewrite
//   (same for backend, shared)
//
// Frontend: an explicit map (FRONTEND_MAP). Old pure re-export barrels are
// removed; names imported through them are traced to the file that defines
// them. Every new primitive folder gets an index.ts barrel and other modules
// import through it. Backend and shared already have domain/primitive
// folders: every kebab-case segment becomes camelCase.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(path.join(ROOT, 'frontend', 'package.json'));
const ts = require('typescript');

const PKG = process.argv[2];
const DRY = process.argv.includes('--dry');
const BASES = { frontend: 'frontend/src', backend: 'backend/src', shared: 'packages/shared/src' };
if (!BASES[PKG]) {
  console.error('usage: relayout.mjs frontend|backend|shared [--dry]');
  process.exit(1);
}
const BASE = BASES[PKG];
const ABS = (rel) => path.join(ROOT, BASE, rel);
const posix = (p) => p.split(path.sep).join('/');

const camel = (seg) => seg.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

// ---------------------------------------------------------------- the map
// old path (relative to frontend/src) -> new path. "DELETE" = pure barrel or
// dead file; names imported through it are traced to their origin.
const D = 'domains/';
const FRONTEND_MAP = {
  'App.tsx': 'app.tsx',
  // app shell
  'components/common/Layout.tsx': D + 'app/layout/layout.tsx',
  'components/common/ErrorBoundary.tsx': D + 'app/errorBoundary/errorBoundary.tsx',
  'components/common/PageCanvas.tsx': D + 'app/pageCanvas/pageCanvas.tsx',
  'components/background-gradient/tropical-tide-background.tsx': D + 'app/background/tropicalTideBackground.tsx',
  'config/index.ts': D + 'app/config/dialerConfig.ts',
  'config/dialerConfig.ts': 'DELETE',
  'lib/theme.tsx': D + 'app/theme/theme.tsx',
  'lib/query-client/index.ts': D + 'app/queryClient/queryClient.ts',
  'lib/utils/index.ts': D + 'app/utils/cn.ts',
  'hooks/use-persisted-state.ts': D + 'app/persistedState/usePersistedState.ts',
  'hooks/use-even-columns.ts': D + 'app/evenColumns/useEvenColumns.ts',
  // auth
  'components/auth/AuthProvider.tsx': D + 'auth/provider/authProvider.tsx',
  'lib/auth/index.ts': D + 'auth/session/session.ts',
  'lib/oauth/index.ts': D + 'auth/oauth/oauth.ts',
  'pages/LoginPage.tsx': D + 'auth/login/loginPage.tsx',
  'pages/CallbackPage.tsx': D + 'auth/callback/callbackPage.tsx',
  'pages/SignupPage.tsx': D + 'auth/signup/signupPage.tsx',
  // api
  'lib/api-client/index.ts': D + 'api/client/apiClient.ts',
  'lib/api-client/api-error.ts': D + 'api/client/apiError.ts',
  'types/database.ts': D + 'api/database/database.ts',
  'hooks/use-optimistic-mutations.ts': D + 'api/optimistic/useOptimisticMutations.ts',
  // ui: design primitives
  'primitives/tokens.ts': D + 'ui/tokens/tokens.ts',
  'primitives/button/button.tsx': D + 'ui/button/button.tsx',
  'primitives/button/variants.ts': D + 'ui/button/variants.ts',
  'primitives/section/section.tsx': D + 'ui/section/section.tsx',
  'primitives/state-select/state-select.tsx': D + 'ui/stateSelect/stateSelect.tsx',
  'primitives/notice/notice.tsx': D + 'ui/notice/notice.tsx',
  'primitives/pill/pill.tsx': D + 'ui/pill/pill.tsx',
  'primitives/input/input.ts': D + 'ui/input/input.ts',
  'primitives/index.ts': 'DELETE',
  'primitives/button/index.ts': 'DELETE',
  'primitives/section/index.ts': 'DELETE',
  'primitives/state-select/index.ts': 'DELETE',
  'primitives/notice/index.ts': 'DELETE',
  'primitives/pill/index.ts': 'DELETE',
  'primitives/input/index.ts': 'DELETE',
  // ui: components
  'components/ui/Badge.tsx': D + 'ui/badge/badge.tsx',
  'components/ui/Button.tsx': D + 'ui/legacyButton/legacyButton.tsx',
  'components/ui/Card.tsx': D + 'ui/card/card.tsx',
  'components/ui/Chip.tsx': D + 'ui/chip/chip.tsx',
  'components/ui/InfoTip.tsx': D + 'ui/infoTip/infoTip.tsx',
  'components/ui/Input.tsx': D + 'ui/input/textInput.tsx',
  'components/ui/Menu.tsx': D + 'ui/menu/menu.tsx',
  'components/common/ActionsMenu.tsx': D + 'ui/menu/actionsMenu.tsx',
  'components/ui/Modal.tsx': D + 'ui/modal/modal.tsx',
  'components/common/ConfirmDialog.tsx': D + 'ui/modal/confirmDialog.tsx',
  'components/ui/PageSkeletons.tsx': D + 'ui/skeleton/pageSkeletons.tsx',
  'components/ui/Skeleton.tsx': D + 'ui/skeleton/skeleton.tsx',
  'components/ui/Spinner.tsx': D + 'ui/spinner/spinner.tsx',
  'components/ui/SectionTitle.tsx': D + 'ui/sectionTitle/sectionTitle.tsx',
  'components/ui/TabBar.tsx': D + 'ui/tabBar/tabBar.tsx',
  'components/ui/Toast.tsx': D + 'ui/toast/toast.tsx',
  'components/ui/WidgetCard.tsx': D + 'ui/widgetCard/widgetCard.tsx',
  'components/ui/icons.tsx': D + 'ui/icons/icons.tsx',
  'components/common/MultiValue.tsx': D + 'ui/multiValue/multiValue.tsx',
  'components/common/StatusSelect.tsx': D + 'ui/status/statusSelect.tsx',
  'components/common/StatusBadge.tsx': D + 'ui/status/statusBadge.tsx',
  'components/common/StatusFilterDropdown.tsx': D + 'ui/status/statusFilterDropdown.tsx',
  // ui: tables
  'components/table/DataTable.tsx': D + 'ui/table/dataTable.tsx',
  'components/table/column-types.tsx': D + 'ui/table/columnTypes.tsx',
  'components/table/use-data-table.ts': D + 'ui/table/useDataTable.ts',
  'components/table/index.ts': 'DELETE',
  'components/common/HeaderFilter.tsx': D + 'ui/table/headerFilter.tsx',
  'components/common/SortableHeaderCell.tsx': D + 'ui/table/sortableHeaderCell.tsx',
  'components/common/RecordIndexCommandMenu.tsx': D + 'ui/table/recordIndexCommandMenu.tsx',
  'components/common/ColumnVisibilityDropdown.tsx': D + 'ui/table/columnVisibilityDropdown.tsx',
  'hooks/use-column-order.ts': D + 'ui/table/useColumnOrder.ts',
  'hooks/use-column-widths.ts': D + 'ui/table/useColumnWidths.ts',
  'lib/list-sort.ts': D + 'ui/table/listSort.ts',
  // twenty
  'lib/twenty/links.ts': D + 'twenty/links/links.ts',
  'lib/twenty/options/index.ts': D + 'twenty/options/options.ts',
  'components/common/TwentyFieldLink.tsx': D + 'twenty/fieldLink/twentyFieldLink.tsx',
  // country
  'lib/country.ts': D + 'country/lookup/country.ts',
  'components/common/CountryBadge.tsx': D + 'country/badge/countryBadge.tsx',
  // dialer
  'components/dialer/DialerProvider.tsx': D + 'dialer/provider/dialerProvider.tsx',
  'components/dialer/DialerDock.tsx': D + 'dialer/dock/dialerDock.tsx',
  'components/dialer/call-lifecycle.ts': D + 'dialer/lifecycle/callLifecycle.ts',
  'components/dialer/sip-session.ts': D + 'dialer/sip/sipSession.ts',
  'sip/config.ts': D + 'dialer/sip/sipConfig.ts',
  'sip/diagnostics.ts': D + 'dialer/sip/sipDiagnostics.ts',
  'sip/index.ts': 'DELETE',
  'components/audio/AudioBridge.tsx': D + 'dialer/audio/audioBridge.tsx',
  'components/audio/AudioSourceSettings.tsx': D + 'dialer/audio/audioSourceSettings.tsx',
  'hooks/use-audio-settings.ts': D + 'dialer/audio/useAudioSettings.ts',
  // calls
  'components/calls/CallInsight.tsx': D + 'calls/insight/callInsight.tsx',
  'components/calls/CallRating.tsx': D + 'calls/rating/callRating.tsx',
  'components/calls/DispositionBadge.tsx': D + 'calls/disposition/dispositionBadge.tsx',
  'components/common/OutcomeSelect.tsx': D + 'calls/disposition/outcomeSelect.tsx',
  'lib/call-outcome.ts': D + 'calls/disposition/callOutcome.ts',
  'pages/CallHistoryPage.tsx': D + 'calls/history/callHistoryPage.tsx',
  'pages/CallDetailPage.tsx': D + 'calls/review/callDetailPage.tsx',
  'hooks/use-call-logs.ts': D + 'calls/data/useCallLogs.ts',
  // contact
  'domains/contact/components/contact-page.tsx': D + 'contact/page/contactPage.tsx',
  'domains/contact/components/contact-sidebar.tsx': D + 'contact/sidebar/contactSidebar.tsx',
  'domains/contact/components/contact-feed.tsx': D + 'contact/feed/contactFeed.tsx',
  'domains/contact/components/contact-rail.tsx': D + 'contact/rail/contactRail.tsx',
  'domains/contact/components/contact-people.tsx': D + 'contact/people/contactPeople.tsx',
  'domains/contact/lib/use-people.ts': D + 'contact/people/usePeople.ts',
  'domains/contact/components/record-history-panel.tsx': D + 'contact/history/recordHistoryPanel.tsx',
  'domains/contact/lib/use-record-history.ts': D + 'contact/history/useRecordHistory.ts',
  'domains/contact/types/contact.ts': D + 'contact/model/contact.ts',
  'domains/contact/utils/to-contact.ts': D + 'contact/model/toContact.ts',
  'domains/contact/utils/contact-notes.ts': D + 'contact/notes/contactNotes.ts',
  'domains/contact/utils/contact-notes.test.ts': D + 'contact/notes/contactNotes.test.ts',
  'domains/contact/index.ts': 'DELETE',
  'pages/ProspectPage.tsx': D + 'contact/list/contactListPage.tsx',
  'lib/contacts.ts': D + 'contact/list/contacts.ts',
  'components/leads/LeadForm.tsx': D + 'contact/leadForm/leadForm.tsx',
  'hooks/use-leads.ts': D + 'contact/data/useLeads.ts',
  'hooks/use-prospects.ts': D + 'contact/data/useProspects.ts',
  // messaging
  'lib/sms.ts': D + 'messaging/smsCount/sms.ts',
  'lib/sms.test.ts': D + 'messaging/smsCount/sms.test.ts',
  // website
  'domains/website/components/website-panel.tsx': D + 'website/panel/websitePanel.tsx',
  'domains/website/index.ts': 'DELETE',
  // activity
  'domains/activity/utils/history-format.ts': D + 'activity/historyFormat/historyFormat.ts',
  'domains/activity/utils/history-format.test.ts': D + 'activity/historyFormat/historyFormat.test.ts',
  'domains/activity/index.ts': 'DELETE',
  // feedback
  'domains/feedback/utils/describe-error.ts': D + 'feedback/describeError/describeError.ts',
  'domains/feedback/utils/describe-error.test.ts': D + 'feedback/describeError/describeError.test.ts',
  'domains/feedback/lib/feedback-bus.ts': D + 'feedback/bus/feedbackBus.ts',
  'domains/feedback/lib/use-feedback.ts': D + 'feedback/toasts/useFeedback.ts',
  'domains/feedback/components/feedback-bridge.tsx': D + 'feedback/bridge/feedbackBridge.tsx',
  'domains/feedback/index.ts': 'DELETE',
  // admin
  'pages/AdminPage.tsx': D + 'admin/page/adminPage.tsx',
  'components/admin/ActivityTable.tsx': D + 'admin/activityTable/activityTable.tsx',
  'lib/admin.ts': D + 'admin/data/admin.ts',
  // campaigns
  'components/campaigns/PowerDialer.tsx': D + 'campaigns/powerDialer/powerDialer.tsx',
  'components/campaigns/CampaignModal.tsx': D + 'campaigns/campaignModal/campaignModal.tsx',
  'hooks/use-call-campaigns.ts': D + 'campaigns/data/useCallCampaigns.ts',
  'hooks/use-campaigns.ts': D + 'campaigns/data/useCampaigns.ts',
  'lib/campaign-stats.ts': D + 'campaigns/stats/campaignStats.ts',
  'lib/campaign-stats.test.ts': D + 'campaigns/stats/campaignStats.test.ts',
  // scripts
  'pages/ScriptsPage.tsx': D + 'scripts/page/scriptsPage.tsx',
  'components/scripts/ScriptsWorkspace.tsx': D + 'scripts/workspace/scriptsWorkspace.tsx',
  'components/scripts/CallScriptViewer.tsx': D + 'scripts/viewer/callScriptViewer.tsx',
  'lib/script-stats.ts': D + 'scripts/stats/scriptStats.ts',
  'hooks/use-scripts.ts': D + 'scripts/data/useScripts.ts',
  // reports
  'pages/ReportsPage.tsx': D + 'reports/page/reportsPage.tsx',
  'components/reports/ReportParts.tsx': D + 'reports/parts/reportParts.tsx',
  'components/reports/BarChart.tsx': D + 'reports/parts/barChart.tsx',
  'lib/reports.ts': D + 'reports/data/reports.ts',
  'lib/reports.test.ts': D + 'reports/data/reports.test.ts',
  'hooks/use-report-settings.ts': D + 'reports/data/useReportSettings.ts',
  // other pages
  'pages/PhoneNumbersPage.tsx': D + 'phoneNumbers/page/phoneNumbersPage.tsx',
  'pages/SettingsPage.tsx': D + 'settings/page/settingsPage.tsx',
};

// ---------------------------------------------------------------- files
const allFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', BASE], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(tsx?|css)$/.test(f) && !f.includes('/generated/'))
  .map((f) => posix(path.relative(BASE, f)));

function newPathOf(rel) {
  if (PKG === 'frontend') {
    if (rel in FRONTEND_MAP) return FRONTEND_MAP[rel];
    if (['main.tsx', 'index.css', 'vite-env.d.ts'].includes(rel)) return rel;
    throw new Error(`frontend file not in the map: ${rel}`);
  }
  return rel.split('/').map(camel).join('/');
}
const plan = new Map(allFiles.map((f) => [f, newPathOf(f)]));

// ---------------------------------------------------------------- resolution
const EXTS = ['', '.ts', '.tsx', '.d.ts', '/index.ts', '/index.tsx'];
function resolveSpec(fromRel, spec) {
  let base;
  if (PKG === 'frontend' && spec.startsWith('@/')) base = spec.slice(2);
  else if (spec.startsWith('.')) base = posix(path.normalize(path.join(path.dirname(fromRel), spec)));
  else return null;
  base = base.replace(/\.js$/, '');
  for (const ext of EXTS) {
    const cand = posix(path.normalize(base + ext));
    if (plan.has(cand)) return cand;
  }
  return null;
}

// Pure barrels being deleted: name -> defining file (followed recursively).
const parsed = new Map();
function sourceOf(rel) {
  if (!parsed.has(rel)) {
    const text = readFileSync(ABS(rel), 'utf8');
    parsed.set(rel, ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS));
  }
  return parsed.get(rel);
}
function declaredNames(rel) {
  const sf = sourceOf(rel);
  const names = new Set();
  for (const st of sf.statements) {
    const mods = ts.canHaveModifiers(st) ? ts.getModifiers(st) ?? [] : [];
    const exported = mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && st.name && ts.isIdentifier(st.name)) names.add(st.name.text);
    if (exported && ts.isVariableStatement(st)) st.declarationList.declarations.forEach((d) => ts.isIdentifier(d.name) && names.add(d.name.text));
    if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) st.exportClause.elements.forEach((e) => names.add(e.name.text));
  }
  return names;
}
function originOf(rel, name, seen = new Set()) {
  if (seen.has(rel)) return null;
  seen.add(rel);
  if (plan.get(rel) !== 'DELETE' && declaredNames(rel).has(name)) return { file: rel, name };
  const sf = sourceOf(rel);
  for (const st of sf.statements) {
    if (!ts.isExportDeclaration(st) || !st.moduleSpecifier) continue;
    const target = resolveSpec(rel, st.moduleSpecifier.text);
    if (!target) continue;
    if (!st.exportClause) {
      const hit = originOf(target, name, seen);
      if (hit) return hit;
    } else if (ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) {
        if (el.name.text === name) return originOf(target, el.propertyName?.text ?? name, seen) ?? { file: target, name: el.propertyName?.text ?? name };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- specifiers
const newDirs = new Set([...plan.values()].filter((p) => p !== 'DELETE').map((p) => posix(path.dirname(p))));
function barrelDir(newRel) {
  // Frontend modules are imported through their folder's index.ts.
  return PKG === 'frontend' && newRel.startsWith(D) ? posix(path.dirname(newRel)) : null;
}
function specFor(fromNew, targetNew) {
  const fromDir = posix(path.dirname(fromNew));
  const tDir = posix(path.dirname(targetNew));
  if (PKG === 'frontend') {
    const noExt = targetNew.replace(/\.(tsx?|d\.ts)$/, '');
    if (fromDir === tDir) return `./${path.posix.basename(noExt)}`;
    const bd = barrelDir(targetNew);
    if (bd && !/\.test\.tsx?$/.test(targetNew)) return `@/${bd}`;
    if (targetNew.endsWith('.css')) return `./${posix(path.relative(fromDir, targetNew))}`;
    return `@/${noExt}`;
  }
  let rel = posix(path.relative(fromDir, targetNew)).replace(/\.tsx?$/, '.js');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

// ---------------------------------------------------------------- rewrite
const out = new Map(); // newRel -> text
let rewrites = 0;
for (const [oldRel, newRel] of plan) {
  if (newRel === 'DELETE' || oldRel.endsWith('.css')) continue;
  const sf = sourceOf(oldRel);
  const text = sf.getFullText();
  const edits = []; // [start, end, replacement]
  const visit = (node) => {
    let lit = null;
    let decl = null;
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      lit = node.moduleSpecifier;
      decl = node;
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      lit = node.arguments[0];
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      lit = node.argument.literal;
    }
    if (lit) {
      const target = resolveSpec(oldRel, lit.text);
      if (target) {
        const targetNew = plan.get(target);
        if (targetNew !== 'DELETE') {
          const spec = specFor(newRel, targetNew);
          if (spec !== lit.text) {
            edits.push([lit.getStart(sf) + 1, lit.getEnd() - 1, spec]);
            rewrites++;
          }
        } else if (decl && ts.isImportDeclaration(decl) && decl.importClause?.namedBindings && ts.isNamedImports(decl.importClause.namedBindings)) {
          // Import through a deleted barrel: one import per origin module.
          const typeOnly = decl.importClause.isTypeOnly;
          const groups = new Map();
          for (const el of decl.importClause.namedBindings.elements) {
            const imported = el.propertyName?.text ?? el.name.text;
            const origin = originOf(target, imported);
            if (!origin) throw new Error(`${oldRel}: cannot trace ${imported} through ${target}`);
            const spec = specFor(newRel, plan.get(origin.file));
            const local = el.name.text;
            const part = `${el.isTypeOnly && !typeOnly ? 'type ' : ''}${origin.name === local ? local : `${origin.name} as ${local}`}`;
            if (!groups.has(spec)) groups.set(spec, []);
            groups.get(spec).push(part);
          }
          const replacement = [...groups.entries()]
            .map(([spec, parts]) => `import ${typeOnly ? 'type ' : ''}{ ${parts.join(', ')} } from "${spec}";`)
            .join('\n');
          edits.push([decl.getStart(sf), decl.getEnd(), replacement]);
          rewrites++;
          return;
        } else if (!decl && ts.isCallExpression(lit.parent)) {
          // import("barrel").then((m) => ({ default: m.Name })): trace the names used on m.
          const call = lit.parent;
          const then = call.parent;
          const thenCall = then && ts.isPropertyAccessExpression(then) && then.name.text === 'then' ? then.parent : null;
          const fn = thenCall && ts.isCallExpression(thenCall) ? thenCall.arguments[0] : null;
          const param = fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) ? fn.parameters[0]?.name : null;
          if (!param || !ts.isIdentifier(param)) throw new Error(`${oldRel}: dynamic import of deleted barrel ${target} without .then(m => m.X)`);
          const used = new Set();
          const walk = (n) => {
            if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === param.text) used.add(n.name.text);
            ts.forEachChild(n, walk);
          };
          walk(fn.body);
          const origins = [...used].map((name) => originOf(target, name));
          const files = new Set(origins.map((o) => o?.file));
          if (origins.some((o) => !o || o.name !== [...used][origins.indexOf(o)]) || files.size !== 1) throw new Error(`${oldRel}: cannot trace dynamic import of ${target}`);
          edits.push([lit.getStart(sf) + 1, lit.getEnd() - 1, specFor(newRel, plan.get([...files][0]))]);
          rewrites++;
        } else if (decl && ts.isExportDeclaration(decl)) {
          throw new Error(`${oldRel}: re-export from deleted barrel ${target}`);
        } else {
          throw new Error(`${oldRel}: unsupported import of deleted barrel ${target} (${lit.text})`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  let next = text;
  for (const [s, e, r] of edits.sort((a, b) => b[0] - a[0])) next = next.slice(0, s) + r + next.slice(e);
  out.set(newRel, next);
}

// New frontend barrels: one index.ts per primitive folder.
const barrels = new Map();
if (PKG === 'frontend') {
  for (const dir of newDirs) {
    if (!dir.startsWith(D)) continue;
    const files = [...plan.values()].filter((p) => p !== 'DELETE' && posix(path.dirname(p)) === dir && /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) && !p.endsWith('/index.ts'));
    if (!files.length) continue;
    const lines = files.sort().map((f) => `export * from "./${path.posix.basename(f).replace(/\.tsx?$/, '')}";`);
    barrels.set(`${dir}/index.ts`, `// Public surface of ${dir.slice(D.length)}. Other modules import from here, never from a file inside.\n${lines.join('\n')}\n`);
  }
}

// ---------------------------------------------------------------- report / apply
const moves = [...plan].filter(([a, b]) => b !== 'DELETE' && a !== b);
const deletes = [...plan].filter(([, b]) => b === 'DELETE').map(([a]) => a);
console.log(`${PKG}: ${moves.length} moves, ${deletes.length} deletes, ${rewrites} import rewrites, ${barrels.size} barrels`);
if (DRY) {
  for (const [a, b] of moves.slice(0, 400)) console.log(`  ${a} -> ${b}`);
  for (const a of deletes) console.log(`  ${a} -> (deleted)`);
  process.exit(0);
}

const git = (...args) => execFileSync('git', args, { cwd: ROOT, stdio: 'pipe' });
const tracked = new Set(execFileSync('git', ['ls-files', BASE], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => posix(path.relative(BASE, f))));
// Two-step moves avoid case-only renames confusing a case-insensitive filesystem.
const staged = [];
for (const [a, b] of moves) {
  const tmp = `${a}.relayout-tmp`;
  if (tracked.has(a)) git('mv', path.posix.join(BASE, a), path.posix.join(BASE, tmp));
  else execFileSync(process.platform === 'win32' ? 'cmd' : 'mv', process.platform === 'win32' ? ['/c', 'move', ABS(a), ABS(tmp)] : [ABS(a), ABS(tmp)]);
  staged.push([tmp, b, tracked.has(a)]);
}
for (const [tmp, b, wasTracked] of staged) {
  mkdirSync(path.dirname(ABS(b)), { recursive: true });
  if (wasTracked) git('mv', path.posix.join(BASE, tmp), path.posix.join(BASE, b));
  else execFileSync(process.platform === 'win32' ? 'cmd' : 'mv', process.platform === 'win32' ? ['/c', 'move', ABS(tmp), ABS(b)] : [ABS(tmp), ABS(b)]);
}
for (const a of deletes) {
  if (tracked.has(a)) git('rm', '-q', path.posix.join(BASE, a));
}
for (const [rel, text] of out) writeFileSync(ABS(rel), text);
for (const [rel, text] of barrels) writeFileSync(ABS(rel), text);

// Remove folders left empty.
function prune(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory()) prune(path.join(dir, e.name));
  if (readdirSync(dir).length === 0 && dir !== path.join(ROOT, BASE)) rmdirSync(dir);
}
prune(path.join(ROOT, BASE));

// The path map, for docs and scripts.
writeFileSync(path.join(ROOT, `.relayout-${PKG}.json`), JSON.stringify(Object.fromEntries(plan), null, 1));
console.log('done; path map in', `.relayout-${PKG}.json`);
