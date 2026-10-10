# Design system

How every screen in the dialer looks and behaves, and the code that enforces it. The rules are short because the primitives carry them: a screen that uses `@/primitives` gets the right radius, type, colour and state logic without choosing any of it.

The visual language follows the ListeningKit dashboard (`listeningkit-hackathon`, `DASHBOARD_DESIGN.md`): same Satoshi font, same text tokens, the same link, button and value recipes. Twenty's own UI conventions are kept for reference in [twenty-ui-reference.md](./twenty-ui-reference.md).

## Where things live

| Path | Holds |
|---|---|
| `packages/shared/src/domains/<domain>/` | Rules both the backend and the SPA use: `types.ts`, `lib/*-machine.ts` (pipelines), `utils/` (pure helpers). Imported as `@dialer/shared`. |
| `frontend/src/primitives/<primitive>/` | Buttons, sections, pills, notices, inputs, the pipeline picker. Sizes come from `primitives/tokens.ts`. |
| `frontend/src/domains/<domain>/` | One feature: `components/` (screens and panes), `lib/` (React Query hooks), `types/`, `utils/` (pure, unit-tested). |
| `backend/src/lib/pipelines/` | The write-side guard that runs the shared machines before anything reaches Twenty. |

File and directory names in `domains/`, `primitives/` and `packages/shared/src/domains/` are kebab-case (`contact-sidebar.tsx`, `use-people.ts`). Older code under `components/` and `pages/` moves over as it is touched.

## State: one pipeline per field

Every field that represents progress is declared once as a machine in `packages/shared` and used on both sides:

| Machine | Twenty field | States |
|---|---|---|
| `contactStatusMachine` | `coldCallStatus` (prospects, leads) | New, Contacted, Interested, Call back, Not interested, Converted, Do not contact (final, reopen only on purpose) |
| `outreachMachine` | `agencyProspect.outboundLabel` | Needs enrichment … Message sent … Replied, Delivery failed, Do not contact (final) |
| `videoMachine` | `agencyProspect.videoStatus` | No video yet, Queued, Recording, Rendered, Video ready, Video failed |
| `callResultMachine` | `agencyCall.status` | In progress, Completed, No answer, Busy, Failed; a finished call never reopens |

Each state has a label (shown to people), a one-line description, a tone, and the states it may move to.

- **Backend**: routes call the machine before writing. A move it does not allow is refused with HTTP 409 and the reason (`code: "INVALID_TRANSITION"`). Sending the prospect page also runs `onPageSent` and `checkSmsRoute` (422 `SMS_ROUTE_BLOCKED` for a cross-country send).
- **Frontend**: `StateSelect` builds its menu from the machine: allowed moves, then the rest disabled with the reason, and a final state offering only "Reopen". `StatePill` shows a state read-only. Refusals from the server reach a toast with the server's words.
- Never write a status string by hand in a screen or a route. Lower-case legacy values go through `toContactStatus` / `toLegacyStatus`.

## Scale

From `frontend/src/primitives/tokens.ts`. Add a value there (and here) or use the nearest one.

| Role | Value |
|---|---|
| Radius: buttons, inputs, select triggers | 8px (`RADIUS.control`) |
| Radius: pills, chips, avatars, keypad keys | `rounded-md` (`RADIUS.chip`); never `rounded-full` |
| Radius: cards and sections | 10px (`RADIUS.card`) |
| Radius: dock, modals | 12px (`RADIUS.overlay`) |
| Text: chips, meta, field labels, timestamps | 12px |
| Text: body, table cells, buttons, sentences | 13px |
| Text: inputs and field values | 14px |
| Text: list and card titles | 15px |
| Text: page and section headings | `text-xl` |
| Control heights | 32 (`sm`), 36 (`md`, default), 44 (`lg`) |

Weights: 400 for body text, 600 for labels, values, buttons and titles. Satoshi only; no monospace (enforced).

## Text colour carries meaning

| Use | Token |
|---|---|
| Values, titles, anything the person came to read | `--ods-text-primary`, weight 600 (`VALUE`) |
| Field labels, descriptions, meta lines, menu descriptions | `--ods-text-secondary` (`LABEL`) |
| Placeholders, timestamps in dense lists, disabled | `--ods-text-tertiary`, sparingly |
| On a brand-filled surface (selected menu row, primary button) | white; descriptions at 88% white |

Values are never blue. Blue (`--ods-brand-600`) means "you can act on this": primary buttons, links, the selected row.

## Links

One recipe, the `.ods-link` class (`LINK`): bold brand text with a dashed underline at half strength, solid on hover. Use it for every in-app link and text button ("Add email", "Open call review", URLs). Long URLs are shown short (`host/path`) with the full URL in `title`, plus Copy and Open icon buttons beside them.

## Buttons

`Button` from `@/primitives` (or `buttonClass()` on an `<a>`):

| Variant | Use |
|---|---|
| `primary` | The one main action in an area (Mark as sent, Add note, Save) |
| `secondary` | Every other action. Brand-tinted (`--ods-brand-50` fill, brand text), not a grey outline |
| `ghost` | Quiet actions (Cancel, Clear, Undo) and icon buttons in headers and rows |
| `call` | Starting a call. Green always means the phone |
| `danger` | End call only |
| `danger-soft` | Delete and remove in forms and menus |

An icon-only button is a `Button` with `icon` and an `aria-label`. Icons are FA6 Solid from `@/components/ui/icons`; add new ones there.

## Pills

`Pill` / `StatePill`: the gray chip with a tone dot or an FA6 icon, 12px semibold. Use one for any short value that should stand out from text: a state, a count, a country, "Primary", "Saved", "Custom". Tones map to one colour each (`TONE_DOT`): neutral gray, info sky, progress blue, positive emerald, negative red, warning amber.

The ListeningKit dashboard tints the whole badge instead (emerald-50 fill, emerald-200 border). This app keeps the gray chip with a coloured dot, by an earlier decision; switching is one change in `Chip` if that decision changes.

## Cards, sections and dividers

`Section` is the card: 44px header (icon, title, count pill, eye tooltip, action), then a body whose rows run edge to edge so every divider meets the border. Put rows in `SectionRow`; use `padded` for forms and free text. Never pad the section body and then draw borders inside the padding: that is what makes dividers stop short.

Explanations live behind the eye tooltip (`InfoTip`, TipCard format), never as paragraphs under a title.

## Fields

Label above value. Editable fields show a pencil and, when empty, an "Add ..." link; read-only fields show a lock that says where the value comes from. Enter or leaving the input saves; Escape cancels; a "Saved" pill confirms. Every save goes through the API to Twenty, so it appears in Record history with who made it.

## Menus

`SelectMenu` (`.ods-menu`) is the only dropdown; native `<select>` is not allowed. Options may carry a dot or icon, a hint, a one-line `description` and `disabled`. A disabled option stays visible and its description says why.

## Loading and counts

A number is shown only once the data behind it has loaded. Until then the count pill is a skeleton (`Section count={null}`, `<Skeleton/>` as a `ReportCard` unit, an undefined tab badge), never a premature `0` and never the previous query's total. Server-paged tables treat an unknown total as "still loading": rows stay skeletons and the header count waits with them (`useContactWindow` drops the placeholder total while a new search, filter or sort loads).

## Scrollbars

No horizontal scrollbar anywhere. Content that is wider than its box still scrolls (trackpad, shift+wheel, touch); only the bar is hidden. `index.css` owns this: it styles the base `::-webkit-scrollbar` (Chromium only honours the `:horizontal` rule when the base is styled), gives horizontal bars zero height and vertical bars a slim themed thumb, and gives Firefox thin bars. Components never set `scrollbar-width` or `scrollbar-color`: Chrome 121+ drops every `::-webkit-scrollbar` rule on an element that has either, which brings the horizontal bar back. The design check fails a push that does.

## Notices

`Notice` with a tone: inline, inside the card the problem belongs to, for something blocked or just done ("This number cannot text them", "Marked as sent"). Failures of an action go to a toast.

## Enforced on push

`scripts/check-design-system.mjs` (lefthook pre-push) fails the push when `frontend/src/domains`, `frontend/src/primitives` or `packages/shared` contain a native `<select>`, `uppercase tracking` labels, an off-scale radius or font size, or a hand-built button class; and when anything in `frontend/src` uses a native `<select>` or uppercase-tracking labels. The emoji, monospace and `rounded-full` checks still apply everywhere.
