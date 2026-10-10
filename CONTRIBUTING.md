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

## Git hooks

lefthook runs three gates once installed (`bunx lefthook install`), cheapest first. Each script names its emergency bypass variable in its header.

**pre-commit** (seconds, staged changes):

| Check | Fails when |
|---|---|
| `scripts/check-branch.mjs` | you commit straight to `main`, or the branch is not `<type>/<short-kebab-name>` |
| `scripts/check-code.mjs --staged` | a staged file breaks a code rule: a folder or file that is not camelCase, frontend code outside `domains/<domain>/<primitive>/`, an import reaching inside another module, a button that does nothing, a toggle that does not expose its state, or a pipeline value written as a bare string ([naming-conventions.md](docs/naming-conventions.md)) |
| `scripts/check-design-system.mjs` | an off-scale radius or font size, a native `<select>`, an uppercase label, a hand-built button, or `scrollbar-width` in a component ([design-system.md](docs/design-system.md)) |
| `scripts/check-no-emojis.mjs`, `check-no-monospace.mjs`, `check-no-rounded-full.mjs` | a brand rule is broken |
| `scripts/check-secrets.mjs` | a credential is committed: a JWT, a private key, a provider key, or a connection string with a real password |
| `scripts/check-lockfile.mjs` | a `package.json` changes dependencies without `bun.lock` |

**commit-msg**: `scripts/check-commit-msg.mjs` requires Conventional Commits (see below).

**pre-push** (the whole repo):

| Check | Fails when |
|---|---|
| `scripts/check-code.mjs` | any file breaks a code rule |
| types | `tsc` fails in `packages/shared`, `backend` or `frontend` |
| `scripts/run-tests.mjs` | a unit test fails in any package |
| `bun run build` | the production build fails |
| `scripts/audit-feedback.mjs --check` | an action can fail without telling anyone, or `docs/feedback-map.md` is stale ([feedback-map.md](docs/feedback-map.md)) |
| `scripts/check-docs.mjs` | a documented file is missing, a diagram is unlisted or invalid, the README's diagrams drifted, or a relative link is broken |
| `scripts/test-diagram-lint.mjs` | the Mermaid linter stops catching the footguns it claims to catch |
| `scripts/check-scope.mjs` | anything outside the application's scope is tracked in git |

Run any of them by hand, e.g. `node scripts/check-code.mjs` or `bunx lefthook run pre-push`.

### Credentials

A live Twenty workspace API key was once committed in `backend/scripts/` and
pasted into ad-hoc probes under `ops/`. Both are gone, and
`check-secrets.mjs` now fails the push if anything like that comes back.

Read keys from the environment. `scripts/check-secrets.mjs` has one reviewed
exception, Twenty's published localhost:2020 fixture key in
`twenty-native-app/vitest.config.ts`, and it matches on the decoded workspace
id, so swapping in a real token still fails.

If you find a leaked key: rotate it in Twenty **first**. Removing the file does
not un-leak a key that was ever committed, because it stays in git history.


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

## Branches and commit messages

Work on a branch named `<type>/<short-kebab-name>` (`feat/contact-dialer-page`, `fix/pin-state`); `main` takes merges only.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): subject`, enforced by the commit-msg hook.

```
feat(dialer): show the pinned state on the pin button
fix(calls): stamp telnyxCallId before starting the recording
docs: update the SIP provider guide
refactor(contact): move the sidebar into domains/contact/sidebar
```

- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Add `!` after the type for a breaking change.
- Subject in lower case, no trailing period; first line at most 72 characters; a blank line before the body.
- Merge, revert, fixup and squash messages from git pass as they are.

## Pull requests

1. Update the docs, including the diagram, if you changed behaviour.
2. Make sure the pre-push hooks pass (`bunx lefthook run pre-push`).
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
