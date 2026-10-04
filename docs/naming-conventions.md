# Naming Conventions

This repo (root, `backend/`, `frontend/`, `packages/`, `railcode/`) follows one
shape. The same shape is intended to be portable: any feature in any package in
this workspace is named the same way, so a reader who learns one directory can
predict every other directory without looking.

New code must match it. Mechanical renames are fine; inventing a second pattern
is not.

## The one rule

**Everything is a domain, and inside a domain everything is a primitive named
after the thing it is actually about.**

```
<package>/src/lib/<domain>/<primitive>/index.ts
<package>/src/routes/<domain>/<primitive>/index.ts
```

- `domain` — the bounded context or external system you are talking to
  (`twenty`, `telnyx`, `bark`, `leads`, `notify`, `auth`, `utils`).
- `primitive` — the single thing you can do inside that domain.

Never `lib/<domain>/<primitive>.ts`. Never `lib/<primitive>.ts` for something
with a domain. A file directly under `lib/` is not a legal module.

## Naming style: the external system wins

**A module that mirrors an external system uses that system's own naming
style, not this repo's.** This is the rule that matters most, because it is the
one you can silently get wrong.

Twenty's objects are **camelCase** — that is literally the value of
`nameSingular` in Twenty's own metadata API (`workspaceMember`, `agencyLead`,
`agencyCall`, `agencyPhone`, `agencyProspect`, `agencyCampaign`, `agencyScript`).
So a module mirroring a Twenty object is named with that object's `nameSingular`
**verbatim**:

| Module | Mirrors | Correct? |
|---|---|---|
| `lib/twenty/workspaceMember/` | object `workspaceMember` | yes |
| `lib/twenty/actor/` | field type `ACTOR`, field `createdBy` | yes |
| `lib/twenty/objectService/` | Twenty's "object" concept | yes |
| `lib/twenty/workspace-member/` | — | **no**: invented kebab-case for a camelCase object |

Two naming styles coexist deliberately:

1. **Mirrored modules** — anything whose name comes from an external system's
   vocabulary keeps that system's style. For Twenty: camelCase object names.
   Never re-spell them (`workspace-member`, `agency-lead`).
2. **Repo-owned modules** — modules the repo owns (route surfaces, helper
   verbs, cross-cutting utilities) use `kebab-case`, per the rule below.

To check a name: ask *what is the source of this name?* If the answer is a
Twenty object, field, or enum, copy Twenty's spelling exactly. Verify it with
the live metadata API rather than from memory:

```
POST {TWENTY_BASE_URL}/metadata
query { objects(paging: { first: 150 }) { edges { node { nameSingular namePlural } } } }
```

That query is the authority for every Twenty name in this repo. When it changes,
these directories change with it, in the same commit.

## kebab-case

- `kebab-case` everywhere the repo owns the name: files, directories, imports,
  URL paths, helper verbs (`map-call.ts`, `build-payload.ts`,
  `extract-bark-key.ts`).
- Inside a mirrored module the *directory* follows the external system, but the
  helper files inside it are still `kebab-case`: the repo still owns those.

## Directory order inside a module

A module directory is always laid out in this order, top to bottom. This order
is the reading order: you learn the types, then the pure helpers, then the
entry point.

```
<module>/
  types.ts      # shared types + interfaces for this module
  helpers/      # PURE functions only (no I/O, no request objects)
    <verb>.ts   # one helper per file, kebab-case
    index.ts    # barrel: export * from each helper
  index.ts      # the entry point: the I/O, wiring, and re-exports
```

Rules that make this real:

- `types.ts` holds **types only** — no runtime values, no functions.
- `helpers/` holds **pure functions only**. No `fetch`, no `process.env`, no
  `Request`, no mutation of arguments. If a helper needs the network or the
  request, it belongs in `index.ts` (or is a helper of a different module).
- `helpers/index.ts` re-exports every helper with `export * from "./<helper>.js"`.
- `index.ts` is the barrel. **Nothing outside a module imports its internals.**
  Consumers import the module's `index.ts`; they never reach past it into
  `helpers/<verb>.ts` or `types.ts`. This is what keeps the public surface
  reviewable in one file.
- Do not create `helpers/` or `types.ts` speculatively. A module with no pure
  helper and no shared type does not need them yet.

## What goes in `lib/` vs `routes/`

| | Location | Test |
|---|---|---|
| Cross-cutting primitive | `src/lib/<domain>/<primitive>/` | Used by more than one route, or has no HTTP surface of its own |
| HTTP surface | `src/routes/<domain>/<primitive>/` | Has handlers, is mounted into the app |

`routes/` modules are mounted; `lib/` modules are imported. A route may import a
lib module; a lib module never imports a route module.

Route modules follow the same `types.ts` → `helpers/` → `index.ts` order, and
their `index.ts` holds only: import consts, router creation, handlers, and the
export. No top-level logic, no mutable state.

## External systems are domains too

Third-party systems get their own domain directory, never a prefixed file name.
The old `twenty-client.ts` / `telnyx.ts` shape is wrong precisely because the
domain was encoded in the *file* instead of the *directory*.

| Domain | Primitives | Naming source |
|---|---|---|
| `twenty` | `oauth`, `client`, `graphql`, `actor`, `webhook`, `workspaceMember`, `objectService`; route modules `oauth`, `phones`, `meta`, `setup`, `webhook` | Twenty object names (camelCase) for mirrored ones |
| `telnyx` | `client` (SIP + recordings + messaging) | vendor name |
| `bark` | `push` | vendor name |
| `leads` | `notify` (new-lead broadcast) | repo-owned |

## Nested routes

A route that belongs to another domain nests under it:

```
routes/twenty/          # domain = twenty
  oauth/                # primitive = oauth
  phones/               # primitive = phones
  meta/                 # primitive = meta
  setup/                # primitive = setup
  webhook/              # primitive = webhook
```

Primitives under one domain share one singular/plural style. Pick **singular**
for primitives that name a thing (`webhook`, `offer`) and **plural** for
collections (`phones`); do not mix the two spellings for the same kind of thing.

## `@dialer/shared`

`packages/shared` is the single source of truth for anything both API and SPA
need (PKCE math, operator-token types, the generated Twenty GraphQL client).

- Exposed as two import faces:
  - `@dialer/shared` — runtime + types (`TwentyOAuthProvider`, code-flow
    helpers, `TokenSet`, `Introspection`, …).
  - `@dialer/shared/api` — the generated typed client
    (`createClient`, schemas).
- The generated client is **checked in**. It is produced from *introspection
  of the live workspace* (not a frozen SDL copy), so when Twenty surface
  changes run `bun run api:client` and commit the diff.
  `bun run api:check` in CI fails if checked-in files are stale.
- Do not hand-edit `packages/shared/src/generated/client/*`.
- **Its `types` entry is `dist/`.** `@dialer/shared` resolves through
  `dist/index.d.ts`, so `sub`/field changes in `src/oauth.ts` are invisible to
  the backend's `tsc` until `bun run build:shared` runs. A type error that
  contradicts the source is a stale `dist`, not a code bug.

## Frontend pairing

- One page per route: `src/pages/<Route>Page.tsx`.
- One React Query hook per domain: `src/hooks/use-<domain>.ts`.
- Client-side libs live under `src/lib/<domain>/<primitive>/` on the same rule
  as the backend — `lib/api-client/`, `lib/auth/`, `lib/oauth/`,
  `lib/query-client/`, `lib/utils/`, `lib/twenty/options/`.
- **No `camelCase.ts` files anywhere.** `apiClient.ts`, `queryClient.ts` and
  `twentyOptions.ts` were all violations; a file is either a module directory
  or a `kebab-case.ts` helper *inside* one.

## Cross-package duplication

If two packages need the same logic, it does not get copied — it moves down to
`packages/shared` behind the two import faces above, and both sides import it.

## Why this changed (2026-09)

Replaced direct-Postgres login with Twenty OAuth (Twenty is the identity
provider). The client secret never leaves the backend: the SPA runs PKCE with a
public discovery endpoint, code redemption + token refresh go through Hono
handlers, and `POST /api/oauth/session` mints the dialer JWT that every other
route already expects. Removed: `pg`, `bcryptjs`, drizzle/sqlite,
`twenty-pg.ts`, password endpoints.

The domain-directory rule replaced a flat `lib/*.ts` shape that had accumulated
one file per integration (`twenty-client.ts`, `twenty-graphql.ts`,
`twenty-object-service.ts`, `telnyx.ts`, plus new `actor.ts`, `bark.ts`,
`workspace-members.ts`). Encoding the domain in a file prefix cannot nest, so
every new primitive added another top-level name; encoding it in the directory
gives each integration a namespace that grows downwards.

Verification note: for `agencyPhones`, the generated GraphQL read was compared
field-for-field against the legacy REST `listTwenty` read — 1 record each, 0
mismatches. The typed read is now used where a single entity matters; the REST
wrappers remain for bulk CRUD.