import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, type IconComponent } from "@/domains/ui/icons";

const WIDTH = 300;
const GAP = 8;

/** Formula operators; anything else in `formula` renders as a term chip. */
const OPERATORS = new Set(["÷", "×", "+", "−", "-", "=", "≥", "≤", "<", ">", "→", "per"]);

/**
 * What a tooltip explains. Every eye tooltip in the app renders this same
 * shape so explanations read visually rather than as a paragraph:
 * header -> one-line meaning -> formula chips -> colour key -> how to use it.
 */
export interface TipSpec {
  title: string;
  icon?: IconComponent;
  /** One plain sentence: what this is. */
  what: string;
  /** e.g. ["Conversations", "÷", "Calls", "=", "Convo rate"] */
  formula?: string[];
  /** Colour key: chart series, health bands, goal colours. */
  key?: { color: string; label: string; note?: string }[];
  /** How to act on it. */
  use?: string;
}

export function TipCard({ tip }: { tip: TipSpec }) {
  const Icon = tip.icon;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center bg-blue-500/15 text-blue-600">
          {Icon ? <Icon className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </span>
        <span className="text-[14px] font-semibold text-[var(--ods-text-primary)]">{tip.title}</span>
      </div>

      <p className="text-[13px] leading-snug text-[var(--ods-text-secondary)]">{tip.what}</p>

      {tip.formula && tip.formula.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-[8px] bg-[var(--ods-bg-secondary)] p-2">
          {tip.formula.map((part, i) =>
            OPERATORS.has(part) ? (
              <span key={i} className="text-[15px] font-bold text-[var(--ods-text-secondary)] px-0.5">
                {part}
              </span>
            ) : (
              <span
                key={i}
                className={`px-2 py-0.5 rounded-md text-[12px] font-semibold border ${
                  i === tip.formula!.length - 1 && tip.formula!.includes("=")
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-[var(--ods-bg-primary)] text-[var(--ods-text-primary)] border-[var(--ods-border)]"
                }`}
              >
                {part}
              </span>
            ),
          )}
        </div>
      )}

      {tip.key && tip.key.length > 0 && (
        <ul className="space-y-1">
          {tip.key.map((k) => (
            <li key={k.label} className="flex items-center gap-2 text-[12px]">
              <span className="w-3 h-3 shrink-0 rounded-md" style={{ background: k.color }} />
              <span className="font-semibold text-[var(--ods-text-primary)]">{k.label}</span>
              {k.note && <span className="ml-auto text-[var(--ods-text-secondary)] tabular-nums">{k.note}</span>}
            </li>
          ))}
        </ul>
      )}

      {tip.use && (
        <div className="flex gap-2 border-t border-[var(--ods-border)] pt-2 text-[12px] leading-snug">
          <span className="shrink-0 font-semibold text-blue-600">Use it to</span>
          <span className="text-[var(--ods-text-secondary)]">{tip.use}</span>
        </div>
      )}
    </div>
  );
}

/**
 * The app-wide "more info" affordance: an eye icon that shows a TipCard on
 * hover or keyboard focus. Use it instead of small helper text under titles
 * and numbers. Rendered in a portal so scroll containers never clip it.
 */
export function InfoTip({ tip, className = "" }: { tip: TipSpec; className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
    const above = r.bottom + 260 > window.innerHeight && r.top > 260;
    setPos({ left, top: above ? r.top - GAP : r.bottom + GAP, above });
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`About ${tip.title}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center justify-center w-6 h-6 shrink-0 rounded-md text-[var(--ods-text-tertiary)] hover:text-blue-600 hover:bg-[var(--ods-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ods-brand-500)] transition-colors ${className}`}
      >
        <Eye className="w-3.5 h-3.5" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: pos.left, top: pos.top, width: WIDTH, transform: pos.above ? "translateY(-100%)" : undefined }}
            className="fixed z-[1000] pointer-events-none rounded-[10px] border border-[var(--ods-border-strong)] bg-[var(--ods-bg-primary)] p-3 text-left font-normal normal-case tracking-normal shadow-[0_12px_32px_rgba(0,0,0,0.2)]"
          >
            <TipCard tip={tip} />
          </div>,
          document.body,
        )}
    </>
  );
}
