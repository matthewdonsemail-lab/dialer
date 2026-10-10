#!/usr/bin/env bash
# One-step setup after cloning. Safe to re-run.
#
#   ./scripts/setup.sh            install, create env files, check the Twenty schema
#   ./scripts/setup.sh --apply    ...and create whatever the schema is missing
#   ./scripts/setup.sh --seed     ...and load the demo workspace (fresh workspaces only)
#
# Nothing is written to Twenty without --apply or --seed.
set -euo pipefail
cd "$(dirname "$0")/.."

APPLY=0
SEED=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    --seed) APPLY=1; SEED=1 ;;
    *) echo "Unknown option: $arg (use --apply or --seed)"; exit 1 ;;
  esac
done

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing $1. $2"; exit 1; }
}
need node "Install Node.js 20 or later: https://nodejs.org"
need bun "Install Bun: https://bun.sh"
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20 or later is required (found $(node -v))."
  exit 1
fi

echo "== Installing packages"
bun run install:all
bunx lefthook install >/dev/null 2>&1 || echo "   (lefthook not installed; the git hooks will not run)"

echo "== Environment files"
for pair in ".env.example:.env.local" "frontend/.env.example:frontend/.env.local"; do
  src="${pair%%:*}"; dst="${pair##*:}"
  if [ -f "$dst" ]; then echo "   $dst exists, kept"; else cp "$src" "$dst"; echo "   created $dst from $src"; fi
done

value() { grep -E "^$1=" .env.local | tail -1 | cut -d= -f2- | tr -d '"' || true; }
missing=()
for key in TWENTY_BASE_URL TWENTY_API_KEY JWT_SECRET; do
  v=$(value "$key")
  if [ -z "$v" ] || [[ "$v" == your-* ]]; then missing+=("$key"); fi
done
if [ ${#missing[@]} -gt 0 ]; then
  echo
  echo "Fill these in .env.local, then run this script again: ${missing[*]}"
  echo "  TWENTY_API_KEY: Twenty, Settings, APIs and Webhooks, create a key."
  echo "  JWT_SECRET: any long random string, e.g. $(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))')"
  exit 1
fi

echo "== Twenty schema"
if [ "$APPLY" -eq 1 ]; then
  bun run twenty:schema
else
  bun run twenty:schema:check || {
    echo
    echo "Your workspace is missing the items above. Create them with: ./scripts/setup.sh --apply"
    exit 1
  }
fi

if [ "$SEED" -eq 1 ]; then
  echo "== Demo workspace"
  bun run twenty:seed
fi

echo
echo "Ready. Start it with: bun run dev"
echo "Then open http://localhost:5173 and sign in with your Twenty account."
