# Naming Conventions

This repo (root, `backend/`, `frontend/`, `packages/`) follows one shape. New
code must match it; mechanical renames are fine, inventing a second pattern is
not.

## Files and directories

- `kebab-case` everywhere: files, directories, imports, URL paths.
- Every route is a **directory**: `src/routes/<domain>/index.ts`. The
  directory is the module; `index.ts` is the handler file.
- Pure helpers for a domain live in that domain's `helpers/` with a barrel:
  `src/routes/<domain>/helpers/` → `index.ts` re-exports each helper.
- Shared domain types sit next to the handlers in `types.ts`.
- Cross-cutting libs (not per-route) live under `src/lib/<domain>/` with the
  same `helpers/` + `types.ts` + `index.ts` (barrel) shape. Components
  outside the barrel are not imported directly elsewhere.

## Route file anatomy

Each `routes/<domain>/index.ts` is ordered: import consts, router creation,
handlers, `export const router`. No top-level logic, no mutable state.

Examples:

```
backend/src/routes/campaigns/
  index.ts          # router, handlers
  types.ts          # DTO / query-param types
  helpers/
    map-campaign.ts
    index.ts        # export * from each helper

backend/src/lib/twenty/oauth/
  client.ts         # provider singleton factory
  types.ts
  helpers/
    config.ts
    provider.ts
    index.ts
  index.ts          # barrel: client, helpers, types
```

## `@dialer/shared`

`packages/shared` is the single source of truth for anything both API and
SPA need (PKCE math, operator-token types, the generated Twenty GraphQL
client).

- Exposed as two import faces:
  - `@dialer/shared` — runtime + types (`TwentyOAuthProvider`, code-flow
    helpers, `TokenSet`, …).
  - `@dialer/shared/api` — the generated typed client
    (`createClient`, schemas).
- The generated client is **checked in**. It is produced from *introspection
  of the live workspace* (not a frozen SDL copy), so when Twenty surface
  changes run `bun run api:client` and commit the diff.
  `bun run api:check` in CI fails if checked-in files are stale.
- Do not hand-edit `packages/shared/src/generated/client/*`.

## Frontend pairing

- One page per route: `src/pages/<Route>Page.tsx`.
- One React Query hook per domain: `src/hooks/use<Domain>.ts`.
- Auth / API helpers in `src/lib/` (`auth.ts`, `apiClient.ts`, `oauth.ts`).

## Why this changed (2026-09)

Replaced direct-Postgres login with Twenty OAuth (Twenty is the identity
provider). The client secret never leaves the backend: the SPA runs PKCE
with a public discovery endpoint, code redemption + token refresh go through
Hono handlers, and `POST /api/oauth/session` mints the dialer JWT that every
other route already expects. Removed: `pg`, `bcryptjs`, drizzle/sqlite,
`twenty-pg.ts`, password endpoints.

Verification note: for `agencyPhones`, the generated GraphQL read was
compared field-for-field against the legacy REST `listTwenty` read — 1 record
each, 0 mismatches. The typed read is now used where a single entity matters;
the REST wrappers remain for bulk CRUD.