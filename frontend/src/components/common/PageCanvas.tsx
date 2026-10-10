import React from "react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { TipSpec } from "@/components/ui/InfoTip";

interface PageCanvasProps {
  title: React.ReactNode;
  /** Qualifier shown in a pill beside the title. */
  subtitle?: string;
  /** Eye tooltip beside the title explaining the page. */
  info?: TipSpec;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "full" | "6xl" | "4xl";
}

export function PageCanvas({
  title,
  subtitle,
  info,
  actions,
  children,
  maxWidth = "full",
}: PageCanvasProps) {
  const maxClass = {
    full: "w-full",
    "6xl": "max-w-6xl mx-auto",
    "4xl": "max-w-4xl mx-auto",
  }[maxWidth];

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden bg-[var(--ods-bg-primary)]">
      {/* Twenty 40px Sub-Header */}
      <header className="h-14 min-h-[56px] px-4 border-b border-[var(--ods-border)] flex items-center justify-between gap-3 bg-[var(--ods-bg-primary)]">
        <SectionTitle as="h1" title={title} pill={subtitle} info={info} />
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </header>

      {/* Scrollable Canvas Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className={maxClass}>{children}</div>
      </div>
    </div>
  );
}