import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

export interface ContactCardRow {
  label: string;
  value: React.ReactNode;
}

export interface ContactCardSection {
  title: string;
  rows: ContactCardRow[];
  defaultOpen?: boolean;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0] as string).slice(0, 2).toUpperCase();
  return `${(parts[0] as string)[0]}${(parts[parts.length - 1] as string)[0]}`.toUpperCase();
}

/**
 * Reference-style contact card (GoHighLevel-like): avatar with initials,
 * name + status, tag chips, and collapsible label-above-value sections.
 * Presentational — pages pass their own badges and rows.
 */
export function ContactCard({
  name,
  status,
  tags,
  sections,
}: {
  name: string;
  status?: React.ReactNode;
  tags?: React.ReactNode;
  sections: ContactCardSection[];
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((s) => [s.title, s.defaultOpen ?? true])),
  );

  return (
    <div className="flex flex-col gap-[var(--ods-sp-4)]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--ods-brand-600)]/15 text-[var(--ods-brand-700)] flex items-center justify-center text-[13px] font-semibold shrink-0">
          {initialsOf(name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-[var(--ods-text-primary)] truncate">{name}</p>
          {status && <div className="mt-1">{status}</div>}
        </div>
      </div>

      {tags && <div className="flex items-center gap-1.5 flex-wrap">{tags}</div>}

      {sections.map((section) => {
        const isOpen = open[section.title] ?? true;
        return (
          <div
            key={section.title}
            className="border border-[var(--ods-border)] rounded-[6px] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setOpen((prev) => ({ ...prev, [section.title]: !isOpen }))}
              aria-expanded={isOpen}
              className="w-full flex items-center justify-between px-3 py-2 bg-[var(--ods-bg-primary)] hover:bg-[var(--ods-bg-secondary)] transition"
            >
              <span className="text-[12px] font-medium text-[var(--ods-text-primary)]">
                {section.title}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[var(--ods-text-tertiary)] transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
            {isOpen && (
              <dl className="flex flex-col gap-[var(--ods-sp-3)] px-3 py-3 border-t border-[var(--ods-border)]">
                {section.rows.map((row) => (
                  <div key={row.label}>
                    <dt className="text-[11px] text-[var(--ods-text-tertiary)]">{row.label}</dt>
                    <dd className="text-[13px] text-[var(--ods-text-primary)] mt-0.5 break-words">
                      {row.value ?? "—"}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}
    </div>
  );
}
