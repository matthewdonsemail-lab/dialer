import { useState } from "react";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useClick,
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
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([useClick(context), useDismiss(context)]);

  if (!primary && others.length === 0) return <span className="text-[var(--ods-text-tertiary)]">—</span>;

  const all = [primary, ...others].filter(Boolean) as string[];
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
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className={`truncate ${kind === "phone" ? "font-mono tabular-nums" : ""}`}>{all[0]}</span>
      {others.length > 0 && (
        <>
          <button
            type="button"
            ref={refs.setReference}
            {...getReferenceProps()}
            title={`${others.length} more ${kind === "phone" ? "number" : "email"}${others.length === 1 ? "" : "s"}`}
            className="shrink-0 h-5 px-2 rounded-full bg-[var(--ods-brand-50)] text-[11px] font-semibold text-[var(--ods-brand-700)] hover:bg-[var(--ods-brand-100)] dark:bg-[var(--ods-brand-900)]/50 dark:text-[var(--ods-brand-300)]"
          >
            +{others.length}
          </button>
          {open && (
            <FloatingPortal>
              <div
                ref={refs.setFloating}
                style={floatingStyles}
                {...getFloatingProps()}
                className="z-[70] w-64 py-1 rounded-[8px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] shadow-[0_12px_32px_rgba(0,0,0,0.18)]"
              >
                <div className="px-3 py-1.5 bg-[var(--ods-bg-secondary)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ods-text-tertiary)]">
                  {kind === "phone" ? "Phone numbers" : "Emails"} · from Twenty
                </div>
                {all.map((v, i) => (
                  <div key={v} className="mx-1 h-9 px-2 flex items-center gap-2 rounded-[6px] hover:bg-[var(--ods-hover)]">
                    <a
                      href={href(v)}
                      title={kind === "phone" ? "Call" : "Email"}
                      className="flex-1 min-w-0 flex items-center gap-2 text-[13px] text-[var(--ods-text-primary)] hover:text-[var(--ods-brand-600)]"
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-[var(--ods-text-tertiary)]" />
                      <span className={`truncate ${kind === "phone" ? "font-mono tabular-nums" : ""}`}>{v}</span>
                    </a>
                    {i === 0 && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--ods-text-tertiary)]">Primary</span>
                    )}
                    <button
                      type="button"
                      onClick={() => copy(v)}
                      title="Copy"
                      className="shrink-0 p-1 rounded-[4px] text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)]"
                    >
                      {copied === v ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
              </div>
            </FloatingPortal>
          )}
        </>
      )}
    </span>
  );
}
