# Naming Conventions

This repo (`frontend/`, `backend/`, `packages/shared/`) follows one shape, so a reader who learns one directory can predict every other directory without looking. `node scripts/check-code.mjs` checks it on the TypeScript AST at every commit (staged files) and push (everything); see [CONTRIBUTING.md](../CONTRIBUTING.md).

`railcode/` is a hand-maintained port with its own layout and is not covered.

## The one rule

**Everything is a domain, and inside a domain everything is a primitive named after the thing it is actually about.**

```
frontend/src/domains/<domain>/<primitive>/<file>
backend/src/lib/<domain>/<primitive>/...
backend/src/routes/<domain>/<primitive>/...
packages/shared/src/domains/<domain>/...
```

- `domain`: the bounded context or external system (`contact`, `dialer`, `calls`, `twenty`, `telnyx`, `ui`).
- `primitive`: the single thing inside that domain (`sidebar`, `people`, `history`, `button`, `phones`).

## camelCase, everywhere

Every folder and every file is **camelCase**, components included:

| Kind | Example |
|---|---|
| Folder | `domains/contact/sidebar/`, `routes/callLogs/`, `domains/contactStatus/` |
| Component | `contactSidebar.tsx`, `dialerDock.tsx`, `websitePanel.tsx` |
| Hook | `usePeople.ts`, `useRecordHistory.ts` |
| Helper | `toContact.ts`, `mapCall.ts`, `describeError.ts` |
| Machine | `contactStatusMachine.ts`, `outreachMachine.ts` |
| Test | `contactNotes.test.ts` next to the file it tests |

Exported React components are still PascalCase identifiers (`export function ContactSidebar`); only file and folder names are camelCase. The only exceptions are tool-owned names (`vite-env.d.ts`, `index.css`) and the generated Twenty client.

Names mirrored from Twenty keep Twenty's spelling, which is already camelCase: `agencyLead`, `workspaceMember`, `agencyCall`. Check a Twenty name against the live metadata API (`scripts/introspect-twenty-messaging.mjs`), not memory.

URL paths, CSS classes, git branches and environment variables are not file names and keep their own conventions (`/phone-numbers`, `.ods-link`, `feat/contact-dialer-page`, `OFFER_BASE_URL`).

## Frontend: one primitive per folder

```
frontend/src/
  main.tsx  app.tsx  index.css  vite-env.d.ts      (the only root files)
  domains/
    contact/
      sidebar/
        index.ts              public surface: export * from each file
        contactSidebar.tsx
      people/
        index.ts
        contactPeople.tsx
        usePeople.ts
    ui/
      button/  section/  pill/  stateSelect/  table/  tokens/ ...
```

- Every primitive folder has an `index.ts` that re-exports its files.
- **Other modules import the folder, never a file inside it**: `import { ContactPeople } from "@/domains/contact/people"`. Inside one folder, files import each other with `./file`.
- Keep a folder's index free of side effects other modules do not need. A file that touches `import.meta.env` or starts I/O at load time gets its own primitive so importing a neighbour does not load it (that is why `ApiError` is `domains/api/error`, apart from `domains/api/client`).
- The domains today: `app` (shell, config, theme), `auth`, `api`, `ui` (design primitives and tables), `dialer`, `calls`, `contact`, `campaigns`, `scripts`, `reports`, `admin`, `activity`, `feedback`, `website`, `twenty`, `country`, `messaging`, `phoneNumbers`, `settings`.

## Backend and shared: module folders

A backend module keeps the order types, then pure helpers, then the entry point:

```
<module>/
  types.ts      types only, no runtime values
  helpers/      pure functions only (no fetch, no process.env, no request)
    <verb>.ts   one camelCase helper per file
    index.ts    export * from each helper
  index.ts      the entry point: I/O, wiring, re-exports
```

- `routes/<domain>/<primitive>/` modules are mounted; `lib/<domain>/<primitive>/` modules are imported. A route may import a lib module; a lib module never imports a route.
- Nothing outside a module imports its internals; consumers import its `index.ts`.
- Do not create `helpers/` or `types.ts` speculatively.

`packages/shared/src/domains/<domain>/` holds what both sides use: `types.ts`, `lib/<name>Machine.ts` (the pipelines), `utils/` (pure helpers), and an `index.ts`. Exposed as `@dialer/shared` (domain logic) and `@dialer/shared/api` (the generated Twenty client, checked in, regenerated with `bun run api:client`). Its types resolve through `dist/`, so run `bun run build:shared` after changing it.

## State lives in pipelines

A field that represents progress (contact status, outreach stage, video, call result, call campaign, offer) is declared once as a machine in `packages/shared` and used by both the routes and the screens. Code never writes such a value as a bare string: it uses `machine.initial`, `machine.state("X")` (typed), or a value that went through `machine.transition`. The `pipeline-literal` rule fails a commit that writes one by hand. See [design-system.md](./design-system.md#state-one-pipeline-per-field).

## Cross-package duplication

If two packages need the same logic it is not copied: it moves to `packages/shared` and both sides import it.

## Moving code

Large moves are done with the AST codemod, not by hand, so every import is rewritten and nothing is missed:

```
node scripts/codemods/relayout.mjs frontend --dry   the plan
node scripts/codemods/relayout.mjs frontend         git mv + rewrite imports
node scripts/codemods/relayoutDocs.mjs              update paths in docs
```

## History

- 2026-09: the domain-directory rule replaced a flat `lib/*.ts` shape that encoded the domain in the file name (`twenty-client.ts`, `telnyx.ts`), which could not nest.
- 2026-10-10: everything moved to camelCase and the frontend to `domains/<domain>/<primitive>/` (from `components/`, `pages/`, `hooks/`, `lib/`), with the rule enforced by `check-code.mjs`. Earlier documents under `docs/plans/` and `docs/project/` describe the older paths as they were.
