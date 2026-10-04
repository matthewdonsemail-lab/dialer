# Documentation map

Start at the [README](../README.md). This page is the index of everything else.

## Understand it

| Document | What it answers |
|---|---|
| [architecture.md](./architecture.md) | What the three deployable surfaces are, which one is current, and where the auth is thin. |
| [ai-analysis.md](./ai-analysis.md) | Call transcripts, AI ratings, and the single canonical agency number. |
| [data-flow.md](./data-flow.md) | How a read or write becomes a row in Twenty, and why pagination is a keyset walk. |
| [diagrams/](./diagrams/README.md) | Seven Mermaid diagrams, each linked to the source file that implements it. |
| [identity.md](./identity.md) | Sign-in: Twenty OAuth PKCE, what the user sees, what happens underneath, and operator config. |

## Run it

| Document | What it answers |
|---|---|
| [quick-start.md](./quick-start.md) | Shortest path to a working local stack. |
| [../SETUP.md](../SETUP.md) | Full environment variable reference. |
| [design-system.md](./design-system.md) | Tokens, table primitives, and the Tailwind config gotcha. |
| [sip-providers.md](./sip-providers.md) | Configuring SIP, for any provider. |

## Ship it

| Document | What it answers |
|---|---|
| [deployment.md](./deployment.md) | Where each piece is deployed and what it needs. |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Local hooks, checks, and the commit convention. |
| [../CHANGELOG.md](../CHANGELOG.md) | What changed. |

## When it breaks

| Document | What it answers |
|---|---|
| [twenty-troubleshooting.md](./twenty-troubleshooting.md) | Twenty 401s, 502s, nginx proxy ports, and the schema bootstrap. |
| [oauth-migration-notes.md](./oauth-migration-notes.md) | The working record of the password→OAuth switch: what was deleted/added, what broke, how each break was proven out. |
| [telnyx/](./telnyx/README.md) | SIP, Call Control, recording, and the Telnyx API surface we depend on. |
| [../SECURITY.md](../SECURITY.md) | Reporting a vulnerability. |

## Reference, not documentation

These are inputs to a decision, not explanations of one.

| Path | What it is |
|---|---|
| [plans/](./plans/) | Design documents for work that was scoped but is not built. Read these before changing the same area. |
| [marketing/](./marketing/) | Launch copy. Nothing here describes how the code works. |
| [okf/datamodel/](./okf/datamodel/dialer.md) | A generated data model snapshot. |
| [../scripts/twenty-schema/](../scripts/twenty-schema/README.md) | One-off local schema helpers. Gitignored, and two of them need deleting. |
| `docs/telnyx/upstream/`, `docs/twenty/upstream/` | Mirrored vendor documentation. Gitignored. Fetch with `node scripts/pull-telnyx-docs.mjs` and `node scripts/pull-twenty-docs.mjs`. |

## Keeping this honest

`scripts/check-docs.mjs` runs on pre-push and fails when a document listed
above is missing, when a diagram is not listed in
[diagrams/README.md](./diagrams/README.md), when the root README does not link
every diagram, or when any relative link here is broken.

`scripts/check-scope.mjs` runs alongside it and fails when anything outside the
application's scope gets tracked in git again.
