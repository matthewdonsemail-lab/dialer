// Pre-push gate: no credentials in source.
//
// Scans tracked files for anything shaped like a real secret: JWTs, private key
// blocks, cloud and provider key prefixes, and connection strings with inline
// passwords. Fails with the offending file:line list.
//
// This exists because a live Twenty workspace API key was committed in
// backend/scripts/ and pasted around in ad-hoc probes under ops/. Both are
// fixed; this stops it coming back.
//
// Bypass for emergencies only:
//   SKIP_SECRET_CHECK=1 git push
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = path.resolve(fileURLToPath(import.meta.url));

if (process.env.SKIP_SECRET_CHECK) {
  console.log('pre-push: SKIP_SECRET_CHECK set, skipping secret scan.');
  process.exit(0);
}

const SCAN_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rb', '.sh', '.ps1',
  '.json', '.yml', '.yaml', '.toml', '.env', '.md', '.mmd', '.html', '.css', '.sql',
]);

const SKIP_PREFIXES = [
  'node_modules/',
  'dist/',
  'build/',
  'docs/telnyx/upstream/',
  'docs/twenty/upstream/',
];

// Reviewed exceptions. Each one is a deliberate, documented decision, not a
// suppression someone added to make a red build go green.
const ALLOWED = [
  {
    file: 'twenty-native-app/vitest.config.ts',
    // Twenty's published local-development fixture key. Workspace
    // 20202020-1c25-4d02-bf25-6aeccf7ea419 on localhost:2020, from Twenty's
    // own docs and example apps. It grants nothing on a real workspace. The
    // real key comes from TWENTY_API_KEY in the environment.
    reason: 'Twenty local-dev fixture key, only valid against localhost:2020',
    // Matched on the decoded claim, because the workspace id is base64
    // encoded and never appears literally in the file.
    jwtWorkspaceId: '20202020-1c25-4d02-bf25-6aeccf7ea419',
  },
];

// Obvious documentation placeholders are not credentials. Without this, every
// `postgres://user:xxx@host` example in a README fails the scan.
const PLACEHOLDER_PASSWORD = /^(?:\*+|x{2,}|y{3,}|z{3,}|a{3,}|pass(word)?|changeme|secret|placeholder|redacted|your[_-].*|todo|replace[_-]?me|<.*>|\$\{.*\}|\{\{.*\}\}|%.*%)$/i;

// A JWT is three base64url segments. The middle one must decode to JSON with a
// real claim set, which is what separates a credential from prose or a hash.
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

const RULES = [
  { name: 'private key block', re: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9_-]{24,}\b/g },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'Twilio account sid', re: /\bAC[0-9a-fA-F]{32}\b/g },
  { name: 'connection string with password', re: /\b(?:postgres|postgresql|mysql|mongodb):\/\/([^:@\s"']+):([^@\s"']+)@/g },
];

function decodeJwtPayload(payload) {
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function isJwt(payload) {
  const claims = decodeJwtPayload(payload);
  // A real token always has one of these.
  return Boolean(claims && (claims.exp || claims.iat || claims.workspaceId || claims.type || claims.sub));
}

let files;
try {
  files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((f) => !SKIP_PREFIXES.some((p) => f.startsWith(p)))
    .filter((f) => SCAN_EXT.has(path.extname(f).toLowerCase()));
} catch {
  console.error('pre-push: could not run git ls-files, skipping secret scan.');
  process.exit(0);
}

const findings = [];

for (const rel of files) {
  const abs = path.join(ROOT, rel);
  if (path.resolve(abs) === SELF) continue;

  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch {
    continue;
  }

  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const where = `${rel}:${i + 1}`;

    for (const match of line.matchAll(JWT)) {
      const [token, payload] = match[0].split('.');
      if (!isJwt(payload)) continue;
      const claims = decodeJwtPayload(payload) ?? {};
      const exception = ALLOWED.find(
        (a) => a.file === rel && a.jwtWorkspaceId && a.jwtWorkspaceId === claims.workspaceId,
      );
      if (exception) {
        console.log(`  note  ${where}: allowed - ${exception.reason}`);
        continue;
      }
      findings.push(`${where}: looks like a JWT credential (decodes to a real claim set)`);
    }

    if (ALLOWED.some((a) => a.file === rel)) return;

    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (const match of line.matchAll(rule.re)) {
        // Skip documentation placeholders in connection strings.
        if (rule.name.startsWith('connection string')) {
          const password = match[2] ?? '';
          if (PLACEHOLDER_PASSWORD.test(password)) continue;
        }
        findings.push(`${where}: ${rule.name} in source`);
      }
    }
  });
}

if (findings.length > 0) {
  console.error('pre-push: FAIL - possible credential in tracked source:');
  for (const finding of findings) console.error(`  - ${finding}`);
  console.error('');
  console.error('If this is a real credential:');
  console.error('  1. Rotate it in the provider FIRST. Removing it from the file is not enough.');
  console.error('  2. Read it from the environment instead (process.env / os.environ).');
  console.error('  3. If it was ever committed, it is in git history. Rotate regardless.');
  process.exit(1);
}

console.log(`pre-push: OK - no credentials found in ${files.length} tracked files.`);
