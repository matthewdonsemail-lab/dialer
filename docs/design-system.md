# DESIGN_SYSTEM.md — Twenty CRM Architecture & Sizing Specification

This document outlines how styling, sizing, and layout decisions are engineered across the
[`twentyhq/twenty`](https://github.com/twentyhq/twenty) open-source repository.

Twenty uses a strict two-package separation:

1. [`packages/twenty-ui`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-ui) — primitive design tokens (named variables for layout constants such as margins and shades) and atomic elements (buttons, inputs, chips, icons).
2. [`packages/twenty-front`](https://github.com/twentyhq/twenty/tree/main/packages/twenty-front) — composite CRM views (tables, drawer panels, modal dialogs, field inputs).

---

## 1. Core Sizing Foundation: 4px Grid System

Twenty bases spacing, heights, paddings, and margins on a predictable **4-pixel incremental grid**. Instead of arbitrary pixel values, sizing relies on CSS custom properties (reusable stylesheet variables prefixed with `--ods-`) injected at the document root.

### Spacing & Layout Scale

| Token | Value | Typical usage |
|---|---:|---|
| `--ods-spacing-0-5` | `2px` | Micro-alignments, tag gaps, inline badges |
| `--ods-spacing-1` | `4px` | Inner button padding (small), compact icon gaps |
| `--ods-spacing-2` | `8px` | Standard input padding, table cell vertical rhythm |
| `--ods-spacing-3` | `12px` | Card padding, modal content separation |
| `--ods-spacing-4` | `16px` | Container gutters, sidebar section padding |
| `--ods-spacing-5` | `20px` | Page header padding |
| `--ods-spacing-6` | `24px` | Large panel margins |
| `--ods-spacing-8` | `32px` | Empty-state view wrappers |

---

## 2. Component Sizing Standards

To preserve dense data visibility across large records and CRM tables, Twenty standardizes interactive elements around two primary fixed heights.

### Buttons and Inputs

#### Small (`h-7` / 28px)
- **Height:** `28px`
- **Font size:** `12px`
- **Horizontal padding:** `8px`
- **Purpose:** Inline table actions, breadcrumb chips, compact filter controls.

#### Medium (`h-10` / 40px)
- **Height:** `40px`
- **Font size:** `13px`
- **Horizontal padding:** `12px`
- **Purpose:** Top navigation, standard form inputs, modal primary actions.

### Icon Bounding Boxes

- `14px` — inline meta indicators (dropdown carets).
- `16px` — standard button and input-prefix icons.
- `20px` / `24px` — main sidebar navigation icons.

---

## 3. Corner Radius Hierarchy

Twenty avoids overly rounded, bubble-like interfaces. It uses subtle radius tokens to keep layouts sharp and utility-first.

| Token | Value | Typical usage |
|---|---:|---|
| `--ods-radius-xs` | `2px` | Badges, micro tags |
| `--ods-radius-sm` | `4px` | Buttons, inputs, menu items, table chips, status badges |
| `--ods-radius-md` | `6px` | Dropdown menus, popovers, flyout cards, widget cards |
| `--ods-radius-lg` | `12px` | Modals, dialog surfaces |
| `--ods-radius-pill` | `9999px` | Avatar status indicators |

---

## 4. Typography Scale

System fonts are prioritized for instant native rendering with zero font layout shift.

### Font Stack

```css
-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif
```

### Type Scale

| Token | Value | Typical usage |
|---|---:|---|
| `--ods-text-xs` | `11px` | Field labels, helper micro-copy, uppercase tracking |
| `--ods-text-sm` | `12px` | Dense table cell content, compact buttons |
| `--ods-text-md` | `13px` | Body text, standard inputs, breadcrumbs |
| `--ods-text-lg` | `16px` | Modal headers, subheadings |
| `--ods-text-xl` | `20px` | Page titles, stat card values |

---

## 5. Color Tokens & Thematic Variables

Twenty uses CSS custom properties for all colors, enabling easy theme switching and consistent application.

### Background Colors

| Token | Value | Usage |
|---|---:|---|
| `--ods-bg-primary` | `#ffffff` | Main content area, table backgrounds |
| `--ods-bg-secondary` | `#f0f0f3` | Card backgrounds, hover states |
| `--ods-bg-tertiary` | `#e5e5ea` | Disabled states, subtle dividers |

### Text Colors

| Token | Value | Usage |
|---|---:|---|
| `--ods-text-primary` | `#18181b` | Primary text, headings |
| `--ods-text-secondary` | `#575757` | Secondary text, labels |
| `--ods-text-tertiary` | `#8a8a93` | Placeholder text, muted indicators |

### Border Colors

| Token | Value | Usage |
|---|---:|---|
| `--ods-border` | `#e5e5ea` | Hairline borders, dividers |
| `--ods-border-strong` | `#d1d1d6` | Active focus states |

### Accent Colors

| Token | Value | Usage |
|---|---:|---|
| `--ods-brand-500` | `#3b82f6` | Primary actions, links |
| `--ods-brand-600` | `#2563eb` | Primary buttons, active states |
| `--ods-emerald-500` | `#10b981` | Success states, converted |
| `--ods-amber-500` | `#f59e0b` | Warning states, interested |
| `--ods-rose-500` | `#f43f5e` | Error states, DNC |

---

## 6. Status Badge System

Status badges use tinted backgrounds with subtle borders for a modern, accessible look.

### Badge Variants

```tsx
// StatusSelect.tsx STATUS_CONFIG
{
  new: { dotColor: "bg-blue-500", bgTint: "bg-blue-500/10", textColor: "text-blue-700" },
  contacted: { dotColor: "bg-indigo-500", bgTint: "bg-indigo-500/10", textColor: "text-indigo-700" },
  interested: { dotColor: "bg-amber-500", bgTint: "bg-amber-500/10", textColor: "text-amber-700" },
  not_interested: { dotColor: "bg-gray-400", bgTint: "bg-gray-400/10", textColor: "text-gray-600" },
  callback: { dotColor: "bg-purple-500", bgTint: "bg-purple-500/10", textColor: "text-purple-700" },
  converted: { dotColor: "bg-emerald-500", bgTint: "bg-emerald-500/10", textColor: "text-emerald-700" },
  do_not_contact: { dotColor: "bg-rose-500", bgTint: "bg-rose-500/10", textColor: "text-rose-700" },
}
```

### Badge Styling

- **Chip trigger:** `h-5` (20px), `rounded-[4px]`, `text-[11px]`
- **Dot indicator:** `w-1.5 h-1.5 rounded-full`
- **Dropdown menu:** `w-40`, `rounded-[6px]`, `z-[60]`
- **Option row:** `h-7`, `rounded-[4px]`, hover:bg-[var(--ods-bg-secondary)]

---

## 7. Relation Field Display Pattern

Twenty CRM uses `{fieldName}Id` pattern for relation fields in the REST API. When displaying related records, always resolve and show the relation name using the `Badge` component.

### Pattern for Displaying Relations

```tsx
import { Badge } from "@/components/ui/Badge";

// In your component:
{record.campaignId && (
  <Badge variant="blue">
    {campaigns.find((c) => c.id === record.campaignId)?.name || "Campaign"}
  </Badge>
)}
```

### Common Relation Badges

| Field | Badge Variant | Usage |
|-------|---------------|-------|
| `campaignId` | `blue` | Script/Campaign relation |
| `companyId` | `purple` | Company/Account relation |
| `personId` | `indigo` | Person/Contact relation |
| `status` | Dynamic | Based on status config |

### Why Badge for Relations?

- **Visual distinction:** Badges provide clear visual separation from plain text
- **Consistent styling:** Uses the same design system tokens
- **Compact display:** Works well in list items and widget cards
- **Hover states:** Provides better interactivity opportunities

---

## 8. Z-Index Hierarchy

### Full-Bleed Table Layout

Table-based pages (Leads, Prospects, Call History) use edge-to-edge rendering with no outer padding:

```tsx
<div className="flex flex-col h-full w-full select-none bg-[var(--ods-bg-primary)]">
  {/* 40px Action Bar */}
  <div className="h-10 px-3 flex items-center justify-between border-b border-[var(--ods-border)] shrink-0">
    {/* Search, filters, action buttons */}
  </div>
  
  {/* Full-bleed Table */}
  <div className="flex-1 w-full overflow-auto">
    <table className="w-full border-collapse text-left">
      {/* Sticky header with bg-[var(--ods-bg-secondary)] */}
      <thead className="sticky top-0 bg-[var(--ods-bg-secondary)] z-10">
        <tr className="h-8 border-b border-[var(--ods-border)]">
          {/* Column headers */}
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--ods-border)]">
        {/* Data rows: h-8, hover:bg-[var(--ods-bg-secondary)] */}
      </tbody>
    </table>
  </div>
</div>
```

### Canvas Page Layout (PageCanvas)

Non-table pages use a structured canvas with a 40px sub-header and scrollable content area:

```tsx
// PageCanvas.tsx
<div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-[var(--ods-bg-primary)]">
  {/* 40px Sub-Header */}
  <header className="h-10 min-h-[40px] px-4 border-b border-[var(--ods-border)] flex items-center justify-between">
    <span className="text-[13px] font-semibold">{title}</span>
    {actions && <div>{actions}</div>}
  </header>
  
  {/* Scrollable Canvas */}
  <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
    {children}
  </div>
</div>
```

### Widget Card Component

Twenty-style card primitive with hairline borders and compact headers:

```tsx
// WidgetCard.tsx
<div className="bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] rounded-[6px] flex flex-col overflow-hidden">
  {/* 32px Header */}
  {title && (
    <div className="h-8 min-h-[32px] px-3 border-b border-[var(--ods-border)] flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
        <span className="text-[11px] font-medium uppercase tracking-wider">{title}</span>
      </div>
      {action && <div>{action}</div>}
    </div>
  )}
  
  {/* Content */}
  <div className="p-3 md:p-4 flex-1">{children}</div>
</div>
```

---

## 8. Z-Index Hierarchy

| Z-Index | Usage |
|---|---|
| `z-10` | Table header sticky position |
| `z-30` | Main top navigation bar |
| `z-40` | Mobile sidebar overlay |
| `z-50` | Toast notifications, dropdown menus |
| `z-60` | Floating UI portals (StatusSelect dropdown) |

---

## 9. Floating UI Integration

For dropdowns and popovers, use `@floating-ui/react` with `FloatingPortal`:

```tsx
import { useFloating, autoUpdate, offset, flip, shift, FloatingPortal } from '@floating-ui/react';

const { refs, floatingStyles } = useFloating({
  open: isOpen,
  onOpenChange: setIsOpen,
  placement: 'bottom-start',
  whileElementsMounted: autoUpdate,
  middleware: [offset(4), flip(), shift({ padding: 8 })],
});

// In render:
<button ref={refs.setReference} onClick={() => setIsOpen(!isOpen)}>
  Trigger
</button>

{isOpen && (
  <FloatingPortal>
    <div ref={refs.setFloating} style={floatingStyles}>
      {/* Menu items */}
    </div>
  </FloatingPortal>
)}
```

---

## 10. Notification System (Toast)

Toast notifications use a fixed bottom-right container with progress indicators:

```tsx
// Toast.tsx - Usage
const { success, error, warning, info } = useToast();

success('Lead deleted', 'John Doe has been removed');
error('Error', 'Failed to delete the lead');

// ToastProvider wraps the app in App.tsx
<ToastProvider>
  <AppRoutes />
</ToastProvider>
```

### Toast Styling

- **Position:** `fixed bottom-3 right-3 z-50`
- **Width:** `w-[296px]`
- **Background:** `bg-white/90 backdrop-blur-md`
- **Border:** `border border-[var(--ods-border)]`
- **Radius:** `rounded-[6px]`
- **Progress bar:** Animated `shrinkWidth` with pause on hover

---

## 11. Practical Implementation Rules

> **Always follow these guidelines to maintain Twenty alignment:**

1. **Use semantic tokens** — Never hardcode hex values; use `--ods-*` variables.
2. **Respect the 4px grid** — Heights should be multiples of 4 (28px, 40px, etc.).
3. **Full-bleed tables** — Table pages have zero outer padding; tables extend edge-to-edge.
4. **Canvas pages need PageCanvas** — Non-table pages must wrap content in `<PageCanvas>` for proper scrolling.
5. **WidgetCard for cards** — Use `<WidgetCard>` for all card-like containers (6px radius, hairline borders).
6. **StatusSelect for status** — Use the custom `StatusSelect` component for all status dropdowns.
7. **Badge system** — Use `Badge` with variant prop for consistent status indicators and relation fields.
8. **Relation fields display** — Always show relation names (e.g., campaign, company) as `<Badge>` components, not plain text.
9. **Toast notifications** — All user actions should provide feedback via `useToast()`.
10. **No floating UI clipping** — Keep `overflow-hidden` off parent containers that need to show dropdowns.
11. **Breadcrumb context** — Detail pages should show the record name in the 40px top bar breadcrumb.

---

## 12. Component Index

| Component | Path | Purpose |
|---|---|---|
| `Layout` | `components/common/Layout.tsx` | App shell with sidebar, header, routing |
| `PageCanvas` | `components/common/PageCanvas.tsx` | Canvas wrapper for non-table pages |
| `WidgetCard` | `components/ui/WidgetCard.tsx` | Twenty-style card primitive |
| `StatusSelect` | `components/common/StatusSelect.tsx` | Floating dropdown for status selection |
| `StatusBadge` | `components/common/StatusBadge.tsx` | Inline status indicator |
| `Badge` | `components/ui/Badge.tsx` | Generic badge with variants |
| `ToastProvider` | `components/ui/Toast.tsx` | Notification system |
| `RecordIndexCommandMenu` | `components/common/RecordIndexCommandMenu.tsx` | Bulk actions toolbar |
| `ColumnVisibilityDropdown` | `components/common/ColumnVisibilityDropdown.tsx` | Column toggle menu |
| `RecordTableColumnHead` | `components/common/RecordTableColumnHead.tsx` | Interactive column header |

---

## 13. Status Filter Patterns

### StatusFilter Type

```tsx
type StatusFilter = string | "all";
```

### Filtering Logic

```tsx
const filteredItems = useMemo(() => {
  if (!items) return [];
  return items.filter((item) => {
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || item.name.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });
}, [items, statusFilter, searchQuery]);
```

---

## 14. Source References

- [`theme-light.css`](https://github.com/twentyhq/twenty/blob/main/packages/twenty-ui/src/theme-constants/theme-light.css) — Light palette variables.
- [`theme-dark.css`](https://github.com/twentyhq/twenty/blob/main/packages/twenty-ui/src/theme-constants/theme-dark.css) — Dark palette variables.
- [`Button.tsx`](https://github.com/twentyhq/twenty/blob/main/packages/twenty-ui/src/input/Button/Button.tsx) — Button primitive.
- [`Chip.tsx`](https://github.com/twentyhq/twenty/blob/main/packages/twenty-ui/src/data-display/Chip/Chip.tsx) — Chip component.
- [`RecordIndexPageHeader.tsx`](https://github.com/twentyhq/twenty/blob/main/packages/twenty-front/src/modules/object-record/record-index/components/RecordIndexPageHeader.tsx) — Table action bar.
- [`RecordTableColumnHead.tsx`](https://github.com/twentyhq/twenty/blob/main/packages/twenty-front/src/modules/object-record/record-table/components/RecordTableColumnHead.tsx) — Column header component.
