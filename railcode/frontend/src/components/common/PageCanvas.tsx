import React from "react";

interface PageCanvasProps {
  title: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "full" | "6xl" | "4xl";
}

export function PageCanvas({
  title,
  subtitle,
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
      <header className="h-10 min-h-[40px] px-4 border-b border-[var(--ods-border)] flex items-center justify-between bg-[var(--ods-bg-primary)]">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--ods-text-primary)]">
            {title}
          </span>
          {subtitle && (
            <span className="text-[12px] text-[var(--ods-text-tertiary)]">
              · {subtitle}
            </span>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>

      {/* Scrollable Canvas Area */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <div className={maxClass}>{children}</div>
      </div>
    </div>
  );
}