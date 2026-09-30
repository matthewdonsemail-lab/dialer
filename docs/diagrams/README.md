# Diagrams

Mermaid sources for the dialer.

Each `.mmd` file here is the **source of truth**. The README at the repository
root embeds a copy of each one inside a ` ```mermaid ` fence, between a marker
comment and the closing fence:

```markdown
<!-- mermaid:call-lifecycle.mmd -->
```mermaid
sequenceDiagram
    ...
```
```

That embedded copy is generated. To change a diagram, edit the `.mmd` file and
run:

```bash
node scripts/check-docs.mjs --fix
```

Never hand-edit the README's mermaid block. The next `--fix` overwrites it, and
the pre-push check fails in the meantime.

To add a **new** diagram: write the `.mmd` file, add it to the table below, add
a `<!-- mermaid:<name>.mmd -->` marker followed by an empty ` ```mermaid `
fence at the right place in the README, then run `--fix`.
`node scripts/linkify-diagrams.mjs` will normalise the markers first if you
would rather paste the source as an image link.

Every `.mmd` file opens with a `%%` comment block naming what it shows and which
source file implements it, so a diagram and its code can be checked against each
other.

| File | What it shows |
|---|---|
| [system-context.mmd](./system-context.mmd) | The three deployable surfaces, the webhook receiver, and every external system. Start here. |
| [agent-workflow.mmd](./agent-workflow.mmd) | The two ways an agent works: calling from the dialer, or logging inside Twenty. |
| [data-flow.mmd](./data-flow.mmd) | How a read or a write becomes rows in Twenty, and why pagination is a keyset walk. |
| [call-lifecycle.mmd](./call-lifecycle.mmd) | Dial to recording, step by step, with the two steps that are easy to get wrong called out. |
| [phone-claim.mmd](./phone-claim.mmd) | The `IDLE / DIALING / ACTIVE` state machine that stops two agents using one number. |
| [data-model.mmd](./data-model.mmd) | The `agency*` objects, their fields, and their relations. |
| [integration-paths.mmd](./integration-paths.mmd) | The two ways the dialer reaches Twenty, and what only each one can do. |
| [bark-new-lead-notify.mmd](./bark-new-lead-notify.mmd) | How a new lead becomes a Bark push on every member's phone via the `BARK_KEY` on `workspaceMember`. |

Render any of them standalone with the [Mermaid live editor](https://mermaid.live),
or with the VS Code Mermaid extension. GitHub renders the embedded copies in the
README directly.

## Keeping them honest

`scripts/check-docs.mjs` runs on pre-push and fails when:

- a file listed in the table above is missing
- a `.mmd` file here is not listed in this table, or a listed one does not exist
- a `.mmd` file does not open with a `%%` comment block
- the root README does not embed every diagram, or embeds one that does not exist
- an embedded diagram has drifted from its `.mmd` source
- any relative link in the README or in `docs/` is broken

When you change a route, an object, or a call step, update the matching diagram
in the same commit. The diagrams are the map, the code is the territory, and
this check is what keeps them from drifting apart.
