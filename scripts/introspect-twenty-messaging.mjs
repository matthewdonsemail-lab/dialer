// Read-only: print what the live Twenty workspace already has for the
// contact-dialer work (docs/plans/CONTACT_DIALER_HANDOFF.md §6.1), so schema
// changes only add what is missing and never duplicate an object.
//
//   node scripts/introspect-twenty-messaging.mjs            human summary
//   node scripts/introspect-twenty-messaging.mjs --json     full JSON for the objects
//
// Loads TWENTY_BASE_URL / TWENTY_API_KEY from .env.local (root, then backend/).
// Only POSTs a metadata *query*; it never mutates anything.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  const env = {};
  for (const file of [path.join(ROOT, '.env.local'), path.join(ROOT, 'backend', '.env.local')]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return { ...env, ...process.env };
}

const env = loadEnv();
const base = (env.TWENTY_BASE_URL || '').replace(/\/$/, '');
const key = env.TWENTY_API_KEY;
if (!base || !key) {
  console.error('TWENTY_BASE_URL and TWENTY_API_KEY must be set (in .env.local).');
  process.exit(1);
}

const QUERY = `{ objects(paging:{first:200}) { edges { node { id nameSingular namePlural isSystem
  fields(paging:{first:200}) { edges { node { name type isNullable options
    relation { type targetObjectMetadata { nameSingular } targetFieldMetadata { name } } } } } } } } }`;

const res = await fetch(`${base}/metadata`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: QUERY }),
});
if (!res.ok) {
  console.error(`Metadata request failed: ${res.status} ${res.statusText}`);
  console.error((await res.text()).slice(0, 500));
  process.exit(1);
}
const body = await res.json();
if (body.errors) {
  console.error('Metadata query errors:', JSON.stringify(body.errors, null, 2).slice(0, 2000));
  process.exit(1);
}

const objects = body.data.objects.edges.map((e) => ({
  ...e.node,
  fields: e.node.fields.edges.map((f) => f.node),
}));
const bySingular = new Map(objects.map((o) => [o.nameSingular, o]));
const WANTED = ['agencyConversation', 'agencyMessage', 'agencyCall', 'agencyProspect', 'agencyLead', 'agencyPhone'];

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(WANTED.map((n) => bySingular.get(n) ?? { nameSingular: n, missing: true }), null, 2));
  process.exit(0);
}

const SYSTEM = new Set(['id', 'createdAt', 'updatedAt', 'deletedAt', 'createdBy', 'updatedBy', 'position', 'searchVector']);

function describe(field) {
  let t = field.type;
  if (field.relation) {
    t += ` ${field.relation.type} -> ${field.relation.targetObjectMetadata?.nameSingular}`;
    if (field.relation.targetFieldMetadata?.name) t += `.${field.relation.targetFieldMetadata.name}`;
  }
  if (Array.isArray(field.options) && field.options.length) t += ` [${field.options.map((o) => o.value).join(', ')}]`;
  return t;
}

console.log(`Twenty workspace: ${base}  (${objects.length} objects)\n`);
for (const name of WANTED) {
  const obj = bySingular.get(name);
  if (!obj) {
    console.log(`== ${name}: MISSING (not in this workspace)\n`);
    continue;
  }
  console.log(`== ${obj.nameSingular} / ${obj.namePlural}  (${obj.isSystem ? "system" : "workspace"}, ${obj.fields.length} fields)`);
  for (const f of obj.fields.filter((f) => !SYSTEM.has(f.name)).sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`   ${f.name.padEnd(28)} ${describe(f)}`);
  }
  console.log('');
}

// What the plan needs, checked against what is live.
const CHECKS = [
  ['agencyProspect', 'notes', 'free-text prospect notes (plan §5.4)'],
  ['agencyProspect', 'note', 'existing note field, if any'],
  ['agencyProspect', 'qualificationStatus', 'qualification (bug #9)'],
  ['agencyCall', 'notes', 'call notes (plan §5.3)'],
  ['agencyCall', 'disposition', 'user outcome (plan §5.3)'],
  ['agencyCall', 'status', 'system result (bug #7)'],
];
console.log('== Plan checks');
for (const [obj, field, why] of CHECKS) {
  const f = bySingular.get(obj)?.fields.find((x) => x.name === field);
  console.log(`   ${(obj + '.' + field).padEnd(34)} ${f ? 'present  ' + describe(f) : 'missing'}  - ${why}`);
}
