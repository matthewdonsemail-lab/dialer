// After relayout.mjs: rewrite old source paths in docs, diagrams, scripts and
// markdown to their new locations, using the .relayout-<pkg>.json maps.
//   node scripts/codemods/relayoutDocs.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASES = { frontend: 'frontend/src', backend: 'backend/src', shared: 'packages/shared/src' };

const pairs = [];
for (const [pkg, base] of Object.entries(BASES)) {
  const file = path.join(ROOT, `.relayout-${pkg}.json`);
  if (!existsSync(file)) continue;
  for (const [from, to] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) {
    if (from === to) continue;
    const target = to === 'DELETE' ? null : to;
    pairs.push([`${base}/${from}`, target ? `${base}/${target}` : null]);
    // Without the extension too ("components/dialer/DialerProvider").
    const fromNoExt = from.replace(/\.(tsx?|css)$/, '');
    if (target && fromNoExt !== from) pairs.push([`${base}/${fromNoExt}`, `${base}/${target.replace(/\.(tsx?|css)$/, '')}`]);
    // Paths written relative to the package source root, when distinctive.
    if (target && from.includes('/')) pairs.push([from, target]);
  }
}
// Longest first, so a full path is replaced before its own prefix.
pairs.sort((a, b) => b[0].length - a[0].length);

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(md|mmd|mjs|yml|json)$/.test(f) && !f.startsWith('.relayout-') && !f.includes('node_modules') && !f.startsWith('scripts/codemods/'));

const boundary = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let changed = 0;
for (const rel of files) {
  const abs = path.join(ROOT, rel);
  const text = readFileSync(abs, 'utf8');
  let next = text;
  for (const [from, to] of pairs) {
    if (!next.includes(from)) continue;
    // Whole-path matches only: not inside a longer path segment.
    const re = new RegExp(`(?<![\\w/-])${boundary(from)}(?![\\w-])`, 'g');
    next = next.replace(re, to ?? `${from} (removed)`);
  }
  if (next !== text) {
    writeFileSync(abs, next);
    changed++;
    console.log('updated', rel);
  }
}
console.log(`${changed} files updated`);
