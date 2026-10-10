import { useState } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { Check, Copy, Mail, Phone } from "@/components/ui/icons";

/**
 * A phone or email field that can hold several values (Twenty keeps one
 * primary plus additional ones). Shows the primary and a "+2" chip, like
 * GoHighLevel; the chip lists every value with call/email and copy actions.
 */
export function MultiValue({
  kind,
  primary,
  extras,
}: {
  kind: "phone" | "email";
  primary?: string | null;
  extras?: string[] | null;
}) {
  const others = (extras ?? []).filter((v) => v && v !== primary);
  // Floating UI only mounts while the list is open: tables render one of
  // these per row, so a closed chip must not carry positioning hooks.
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

  if (!primary && others.length === 0) return <span className="text-[var(--ods-text-tertiary)]">—</span>;

  const all = [primary, ...others].filter(Boolean) as string[];

  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className={`truncate ${kind === "phone" ? "tabular-nums" : ""}`}>{all[0]}</span>
      {others.length > 0 && (
        <>
          <button
            type="button"
            ref={setAnchor}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            aria-expanded={open}
            title={`${others.length} more ${kind === "phone" ? "number" : "email"}${others.length === 1 ? "" : "s"}`}
            className="shrink-0 h-5 px-2 rounded-full bg-[var(--ods-brand-50)] text-[11px] font-semibold text-[var(--ods-brand-700)] hover:bg-[var(--ods-brand-100)] dark:bg-[var(--ods-brand-900)]/50 dark:text-[var(--ods-brand-300)]"
          >
            +{others.length}
          </button>
          {open && anchor && <MultiValueList kind={kind} values={all} anchor={anchor} onClose={() => setOpen(false)} />}
        </>
      )}
    </span>
  );
}

function MultiValueList({
  kind,
  values: all,
  anchor,
  onClose,
}: {
  kind: "phone" | "email";
  values: string[];
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open: true,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
    elements: { reference: anchor },
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const { getFloatingProps } = useInteractions([useDismiss(context)]);

  const Icon = kind === "phone" ? Phone : Mail;
  const href = (v: string) => (kind === "phone" ? `tel:${v}` : `mailto:${v}`);
  const copy = async (v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(v);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      // clipboard blocked; the value is still visible to copy by hand
    }
  };

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{ ...floatingStyles, visibility: isPositioned ? undefined : "hidden" }}
        data-ready={isPositioned || undefined}
        {...getFloatingProps()}
        className="ods-menu w-72"
      >
        <div className="ods-menu-group-label">
          {kind === "phone" ? "Phone numbers" : "Emails"} · from Twenty
        </div>
        {all.map((v, i) => (
          <div key={v} className="ods-menu-item !cursor-default">
            <a
              href={href(v)}
              title={kind === "phone" ? "Call" : "Email"}
              className="flex-1 min-w-0 flex items-center gap-2.5 hover:text-[var(--ods-brand-600)]"
            >
              <Icon className="ods-menu-icon" />
              <span className={`truncate ${kind === "phone" ? "tabular-nums" : ""}`}>{v}</span>
            </a>
            {i === 0 && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[var(--ods-bg-tertiary)] text-[11px] font-semibold text-[var(--ods-text-secondary)]">Primary</span>
            )}
            <button
              type="button"
              onClick={() => copy(v)}
              title="Copy"
              className="shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-[6px] text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-active)]"
            >
              {copied === v ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        ))}
      </div>
    </FloatingPortal>
  );
}
