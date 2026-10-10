// Pre-push gate: documentation is current and internally consistent.
//
// Fails when:
//   1. A required document is missing.
//   2. The root README has no Documentation map section.
//   3. A .mmd diagram exists but is not listed in docs/diagrams/README.md,
//      or is listed but does not exist.
//   4. The root README does not embed every diagram.
//   5. An embedded diagram in the README has drifted from its .mmd source.
//   6. Any relative markdown link in README.md or docs/ is broken.
//
// Run with --fix to regenerate the README's mermaid blocks from the .mmd
// sources instead of failing. That is the supported way to edit a diagram:
// change the .mmd, then run this.
//
// Bypass for emergencies only:
//   SKIP_DOCS_CHECK=1 git push
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = process.argv.includes('--fix');

if (process.env.SKIP_DOCS_CHECK) {
  console.log('pre-push: SKIP_DOCS_CHECK set, skipping documentation check.');
  process.exit(0);
}

const REQUIRED_FILES = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'docs/README.md',
  'docs/architecture.md',
  'docs/data-flow.md',
  'docs/deployment.md',
  'docs/design-system.md',
  'docs/diagrams/README.md',
  'docs/quick-start.md',
  'docs/sip-providers.md',
  'docs/telnyx/README.md',
  'docs/twenty-troubleshooting.md',
];

// Terms that must survive, so a rename or a bad merge cannot quietly remove
// the project's core vocabulary.
const REQUIRED_TERMS = [
  ['README.md', ['dialer', 'Documentation map', 'agencyCalls', 'agencyPhones', 'banner.png']],
  ['docs/architecture.md', ['agencyCalls', 'agencyPhones', 'telnyxCallId', 'twenty-native-app']],
  ['docs/data-flow.md', ['agencyCalls', 'listTwentyPage', 'keyset']],
];

const failures = [];
const fail = (message) => failures.push(message);

const readmePath = path.join(ROOT, 'README.md');
const diagramDir = path.join(ROOT, 'docs', 'diagrams');
const diagramIndex = path.join(diagramDir, 'README.md');

// --- 1. required files -----------------------------------------------------
for (const rel of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(ROOT, rel))) fail(`${rel}: missing`);
}

// --- 2. README documentation map -----------------------------------------
if (fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, 'utf8');
  if (!/^##\s+Documentation map/im.test(readme)) {
    fail('README.md: missing a "## Documentation map" section');
  }
}

// --- diagrams -------------------------------------------------------------
const diagrams = fs.existsSync(diagramDir)
  ? fs.readdirSync(diagramDir).filter((f) => f.endsWith('.mmd')).sort()
  : [];

/** Strip the leading %% header block: it is an editor note, not diagram source. */
function diagramBody(file) {
  // A Windows checkout may hold CRLF; the README embeds LF, so compare without CRs.
  const lines = fs.readFileSync(path.join(diagramDir, file), 'utf8').replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].startsWith('%%') || lines[i].trim() === '')) i += 1;
  return lines.slice(i).join('\n').trim();
}

// --- 3. diagram index and README embedding --------------------------------
if (diagrams.length > 0 && fs.existsSync(diagramIndex)) {
  const index = fs.readFileSync(diagramIndex, 'utf8');
  const listed = new Set([...index.matchAll(/\]\(\.\/([\w.-]+\.mmd)\)/g)].map((m) => m[1]));

  for (const file of diagrams) {
    if (!listed.has(file)) {
      fail(`docs/diagrams/${file}: exists but is not listed in docs/diagrams/README.md`);
    }
  }
  for (const file of listed) {
    if (!diagrams.includes(file)) {
      fail(`docs/diagrams/${file}: listed in docs/diagrams/README.md but does not exist`);
    }
  }
}

// Each .mmd must be embedded in the README between a marker and a mermaid
// fence. The marker is what --fix looks for.
const MARKER = /^<!--\s*mermaid:([\w.-]+)\s*-->$/gm;
const FENCE = '```mermaid\n';
const body = (file) => diagramBody(file);
const block = (file) => `${FENCE}${body(file)}\n\`\`\``;

if (diagrams.length > 0 && fs.existsSync(readmePath)) {
  let readme = fs.readFileSync(readmePath, 'utf8');

  if (FIX) {
    readme = readme.replace(
      /<!--\s*mermaid:([\w.-]+)\s*-->\n```mermaid\n[\s\S]*?\n```/g,
      (whole, file) => {
        if (!diagrams.includes(file)) return whole;
        return `<!-- mermaid:${file} -->\n${block(file)}`;
      },
    );
    fs.writeFileSync(readmePath, readme, 'utf8');
    console.log('check-docs: --fix regenerated the README mermaid blocks from docs/diagrams/*.mmd');
  }

  const finalReadme = fs.readFileSync(readmePath, 'utf8');
  const embedded = new Set([...finalReadme.matchAll(MARKER)].map((m) => m[1]));

  for (const file of diagrams) {
    if (!embedded.has(file)) {
      fail(
        `README.md: does not embed docs/diagrams/${file}. ` +
          `Add a "<!-- mermaid:${file} -->" marker followed by a mermaid fence.`,
      );
      continue;
    }
    const pattern = new RegExp(
      `<!--\\s*mermaid:${file.replace(/\./g, '\\.')}\\s*-->\\n\`\`\`mermaid\\n([\\s\\S]*?)\\n\`\`\``,
    );
    const match = finalReadme.match(pattern);
    if (!match) {
      fail(`README.md: the mermaid block for ${file} is malformed`);
    } else if (match[1].trim() !== body(file)) {
      fail(
        `README.md: the embedded ${file} diagram has drifted from docs/diagrams/${file}. ` +
          'Run: node scripts/check-docs.mjs --fix',
      );
    }
  }
  for (const file of embedded) {
    if (!diagrams.includes(file)) {
      fail(`README.md: embeds mermaid:${file}, which does not exist in docs/diagrams/`);
    }
  }
}

// --- 4. every .mmd has a header comment -----------------------------------
for (const file of diagrams) {
  const raw = fs.readFileSync(path.join(diagramDir, file), 'utf8');
  if (!raw.startsWith('%%')) {
    fail(`docs/diagrams/${file}: must start with a %% comment block describing what it shows`);
  }
}

// --- 4b. every .mmd is structurally valid Mermaid -------------------------
// This is not a full Mermaid parse (that needs mermaid + a DOM), but it
// catches the footguns that have actually broken a render here, none of which
// a "does the README match the source" check would ever notice.
const DIAGRAM_TYPES = [
  'flowchart', 'graph', 'sequenceDiagram', 'stateDiagram-v2', 'stateDiagram',
  'erDiagram', 'classDiagram', 'journey', 'gantt', 'pie', 'timeline',
  'quadrantChart', 'requirementDiagram', 'gitGraph', 'mindmap', 'sankey-beta',
  'xychart-beta', 'block-beta', 'packet-beta', 'C4Context', 'architecture-beta',
];

/** Blank out %% comment tails and the contents of quoted labels. */
function codeOnly(source) {
  return source
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('%%')) return '';
      // Remove "..." label contents so brackets inside them are not counted.
      return line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    })
    .join('\n');
}

for (const file of diagrams) {
  const raw = fs.readFileSync(path.join(diagramDir, file), 'utf8');

  // 1. A diagram type must be declared on the first non-comment line.
  const firstReal = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('%%'));
  if (!firstReal || !DIAGRAM_TYPES.some((t) => firstReal.startsWith(t))) {
    fail(
      `docs/diagrams/${file}: first non-comment line must declare a diagram type ` +
        `(one of ${DIAGRAM_TYPES.join(', ')}), got ${JSON.stringify(firstReal ?? '')}`,
    );
  }

  // 2. A semicolon terminates a statement in a sequence diagram, so any ";"
  //    in the message or note text splits the line and breaks the parse.
  //    This is the exact bug that broke the call-lifecycle render on GitHub.
  if (firstReal === 'sequenceDiagram') {
    raw.split('\n').forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith('%%')) return;
      if (t.includes(';')) {
        fail(
          `docs/diagrams/${file}:${i + 1}: ";" terminates a statement in a ` +
            `sequenceDiagram and will break the render. Use a comma. -> ${t}`,
        );
      }
    });
  }

  // 2b. A bare "%%" line with nothing after it breaks the Mermaid parser.
  //     Use a blank line to separate paragraphs in the header comment.
  raw.split('\n').forEach((line, i) => {
    if (line.trim() === '%%') {
      fail(
        `docs/diagrams/${file}:${i + 1}: a bare "%%" line breaks the Mermaid ` +
          `parser. Use a blank line, or put text after the %% (e.g. "%% -").`,
      );
    }
  });

  // 2c. "subgraph id[\\"label\\"]" with no space is read as the identifier
  //     `id[`, and the diagram will not render.
  raw.split('\n').forEach((line, i) => {
    if (/^\s*subgraph\s+\w+\[/.test(line)) {
      fail(
        `docs/diagrams/${file}:${i + 1}: subgraph needs a space before its ` +
          `bracketed label: 'subgraph id ["label"]'. -> ${line.trim()}`,
      );
    }
  });

  // 2d. An unquoted subgraph label cannot contain parentheses; the parser
  //     reads them as a shape suffix and fails.
  raw.split('\n').forEach((line, i) => {
    const m = /^\s*subgraph\s+\w+\s+\[(.+)\]\s*$/.exec(line);
    if (m && !/^["'].*["']$/.test(m[1].trim()) && /[()]/.test(m[1])) {
      fail(
        `docs/diagrams/${file}:${i + 1}: unquoted subgraph label contains ` +
          `parentheses. Wrap the label in quotes. -> ${line.trim()}`,
      );
    }
  });

  // 3. Unbalanced brackets, and unterminated quoted labels.
  //    Braces are only counted when they stand alone on a line, because
  //    `||--o{` in an erDiagram is cardinality syntax, not an opening brace.
  const code = codeOnly(raw);
  for (const [open, close] of [['(', ')'], ['[', ']']]) {
    const opens = (code.match(new RegExp(`\\${open}`, 'g')) || []).length;
    const closes = (code.match(new RegExp(`\\${close}`, 'g')) || []).length;
    if (opens !== closes) {
      fail(
        `docs/diagrams/${file}: unbalanced "${open}${close}" ` +
          `(${opens} open, ${closes} close)`,
      );
    }
  }
  let braceOpen = 0;
  let braceClose = 0;
  for (const line of code.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    // erDiagram relationship lines carry cardinality, not structure:
    // `agencyPhones ||--o{ agencyCalls : "label"`. The `--` or `..` skips them.
    if (/[-.]{2}/.test(t)) continue;
    if (t.endsWith('{')) braceOpen += 1;
    else if (t === '}') braceClose += 1;
  }
  if (braceOpen !== braceClose) {
    fail(
      `docs/diagrams/${file}: unbalanced block braces ` +
        `(${braceOpen} opening, ${braceClose} closing)`,
    );
  }

  for (const [i, line] of raw.split('\n').entries()) {
    if (line.trimStart().startsWith('%%')) continue;
    const quotes = (line.match(/"/g) || []).length;
    if (quotes % 2 !== 0) {
      fail(`docs/diagrams/${file}:${i + 1}: odd number of quotes, unterminated label -> ${line.trim()}`);
    }
  }
}

// --- 5. relative markdown links resolve ------------------------------------
function walkMarkdown(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkMarkdown(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const markdownFiles = [
  readmePath,
  path.join(ROOT, 'CONTRIBUTING.md'),
  path.join(ROOT, 'SECURITY.md'),
  ...(fs.existsSync(path.join(ROOT, 'docs')) ? walkMarkdown(path.join(ROOT, 'docs')) : []),
];

for (const file of markdownFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = decodeURIComponent(target.split('#')[0]);
    if (!clean) continue;
    const resolved = path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(resolved)) {
      fail(`${rel}: broken link -> ${target}`);
    } else if (resolved.startsWith(ROOT) && !fs.statSync(resolved).isFile() && !fs.statSync(resolved).isDirectory()) {
      fail(`${rel}: link target is neither file nor directory -> ${target}`);
    }
  }
}

// --- required terms -------------------------------------------------------
for (const [rel, terms] of REQUIRED_TERMS) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const content = fs.readFileSync(full, 'utf8');
  for (const term of terms) {
    if (!content.includes(term)) fail(`${rel}: missing required term "${term}"`);
  }
}

if (failures.length > 0) {
  console.error('pre-push: FAIL - documentation is not current:');
  for (const failure of failures) console.error(`  - ${failure}`);
  if (!FIX) {
    console.error('\nEdit the .mmd files under docs/diagrams/, then run: node scripts/check-docs.mjs --fix');
  }
  process.exit(1);
}

console.log(
  `pre-push: OK - documentation consistent (${REQUIRED_FILES.length} required files, ` +
    `${diagrams.length} diagrams in sync, ${markdownFiles.length} markdown files link-checked).`,
);
