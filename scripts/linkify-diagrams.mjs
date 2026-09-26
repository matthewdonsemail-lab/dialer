// Normalises the README's diagram embeds to the marker form that
// check-docs.mjs understands, then let `--fix` fill in the real bodies.
//
// A marker is:
//   <!-- mermaid:<filename>.mmd -->
// followed by a ```mermaid fence.
//
// Idempotent, and the diagram list is read from disk, so adding a new .mmd
// never needs this file edited.
import fs from 'node:fs';

const DIAGRAM_DIR = 'docs/diagrams';
const FENCE = '```mermaid\n';
const CLOSE = '\n```';

let readme = fs.readFileSync('README.md', 'utf8');
let changed = 0;

// 1. Any ![](docs/diagrams/<file>.mmd) image link becomes a marker + fence.
//    The marker stores the basename only; the full path is the link target.
readme = readme.replace(
  /!\[[^\]]*\]\(docs\/diagrams\/([\w.-]+\.mmd)\)/g,
  (_whole, file) => {
    changed += 1;
    return `<!-- mermaid:${file} -->\n${FENCE}PENDING\n${CLOSE}`;
  },
);

// 2. Normalise any marker missing the .mmd suffix.
readme = readme.replace(/<!--\s*mermaid:([\w.-]+?)(?:\.mmd)?\s*-->/g, (whole, name) => {
  const file = name.endsWith('.mmd') ? name : `${name}.mmd`;
  if (file === name) return whole;
  changed += 1;
  return `<!-- mermaid:${file} -->`;
});

fs.writeFileSync('README.md', readme, 'utf8');
console.log(`linkify-diagrams: ${changed} marker(s) normalised`);

const missing = fs
  .readdirSync(DIAGRAM_DIR)
  .filter((f) => f.endsWith('.mmd'))
  .filter((f) => !readme.includes(`<!-- mermaid:${f} -->`));
if (missing.length > 0) {
  console.log(`  not embedded yet: ${missing.join(', ')}`);
  process.exitCode = 1;
}
