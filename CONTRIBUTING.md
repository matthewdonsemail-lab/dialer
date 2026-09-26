# Contributing to dialer

## Getting started

```bash
git clone https://github.com/matthewdonsemail-lab/dialer.git
cd dialer
bun install
bun run install:all
bunx lefthook install      # once, so the pre-push checks run
```

## Development setup

```bash
cp .env.example .env.local
cp backend/.env.example backend/.env.local
cp frontend/.env.example frontend/.env.local
bun run dev                # backend :4000, frontend :3000
```

Full environment reference in [SETUP.md](SETUP.md), shorter version in
[docs/quick-start.md](docs/quick-start.md).

The native Twenty app is a separate build with its own toolchain. Read
`twenty-native-app/AGENTS.md` before touching anything under
`twenty-native-app/src/`.

```bash
cd twenty-native-app
yarn install
yarn typecheck
yarn test:unit
```

## Pre-push checks

Three gates, each a dependency-free `node scripts/check-*.mjs`, run
automatically once lefthook is installed:

| Check | Fails when |
|---|---|
| `scripts/check-docs.mjs` | a documented file is missing, a diagram is unlisted in `docs/diagrams/README.md`, the README's embedded diagram has drifted from its `.mmd` source, or a relative link is broken |
| `scripts/check-scope.mjs` | anything outside the application's scope is tracked in git |
| `scripts/check-no-emojis.mjs` | an emoji appears in a tracked file |

Run them by hand:

```bash
bun run check:docs
bun run check:scope
node scripts/check-no-emojis.mjs
```

Emergency bypass: `SKIP_DOCS_CHECK=1`, `SKIP_SCOPE_CHECK=1`, or
`SKIP_EMOJI_CHECK=1`.

### Editing a diagram

Diagrams live in `docs/diagrams/*.mmd` and are embedded in the README. The
`.mmd` file is the source; the README copy is generated. So:

1. Edit the `.mmd` file.
2. Run `node scripts/check-docs.mjs --fix` to regenerate the README block.
3. Commit both.

Never edit the README's mermaid block directly. The next `--fix` will overwrite
it, and the check will fail until you update the source.

## What does not belong in this repository

The tracked tree is the application only. These stay on your machine and are
gitignored, because they are host-specific, unrelated to the dialer, vendored
from elsewhere, or generated:

- `ops/` - host-specific infrastructure and tailnet addresses
- `matthew-onboarding/` - an unrelated Railcode app
- `agent/`, `.agents/`, `.claude/`, `twenty-native-app/src/skills/` - vendored
  third-party skills
- `hostinger/` - deploy staging output
- `docs/telnyx/upstream/`, `docs/twenty/upstream/` - mirrored vendor docs
- `backend/scripts/` - one-off local schema helpers
- `.env.local`, `temp_login.json` - credentials

`scripts/check-scope.mjs` fails the push if any of them gets tracked. If one
does slip in:

```bash
git rm -r --cached <path>
```

It stays on disk and stops being committed.

## Code style

- TypeScript for all new code.
- Follow the conventions of the directory you are in. `backend/`, `frontend/`
  and `railcode/frontend/` share a UI, so a fix to a shared component
  usually needs applying in two places.
- There is no root lint script. `twenty-native-app/` has its own (`yarn lint`,
  `yarn typecheck`).
- Verify with `bun run build` at the root.

## Two things that will bite you

**The UI is duplicated.** `railcode/frontend/src/` is a port of
`frontend/src/`. The softphone is byte-identical; other components have
drifted. When you change a component, check whether the other copy needs it.

**Ordering in the call path is load-bearing.** The Telnyx call-control id has to
be read from the `requestDelegate` passed to `inviter.invite()`, and stamped on
the call row *before* `POST /api/calls/:id/record`. Both have broken recording
before. See [docs/diagrams/call-lifecycle.mmd](docs/diagrams/call-lifecycle.mmd).

## Commit messages

```
feat: add CSV import for leads
fix: stamp telnyxCallId before starting the recording
docs: update the SIP provider guide
refactor: extract auth into a provider
```

Note the existing history predates conventional commits and uses
`<area>: <description>`. Match whatever the recent log is doing.

## Pull requests

1. Update the docs, including the diagram, if you changed behaviour.
2. Make sure the three pre-push checks pass.
3. Run `bun run build`.
4. Open the PR.

## Reporting issues

Use the GitHub issue templates in `.github/ISSUE_TEMPLATE/`. For SIP problems,
include the provider and the `VITE_SIP_*` configuration. For Twenty API
problems, start with [docs/twenty-troubleshooting.md](docs/twenty-troubleshooting.md)
and include the status code.

## Security

Do not commit credentials. `.env.local` and `temp_login.json` are gitignored for
a reason. If you find a leaked key in a tracked file, rotate it in Twenty
first, then remove the file. See [SECURITY.md](SECURITY.md) for reporting.

## License

By contributing, you agree that your contributions are licensed under the MIT
License.
