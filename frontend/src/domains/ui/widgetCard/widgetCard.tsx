import React from "react";
import { SectionTitle } from "@/domains/ui/sectionTitle";
import type { TipSpec } from "@/domains/ui/infoTip";

interface WidgetCardProps {
  title?: string;
  icon?: React.ElementType;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Qualifier beside the title; strings render in the standard title pill. */
  subtitle?: React.ReactNode;
  /** Eye tooltip beside the title explaining the widget. */
  info?: TipSpec;
}

export function WidgetCard({
  title,
  icon: Icon,
  action,
  children,
  className = "",
  subtitle,
  info,
}: WidgetCardProps) {
  return (
    <div
      className={`bg-[var(--ods-bg-secondary)] border border-[var(--ods-border)] rounded-[10px] flex flex-col overflow-hidden ${className}`}
    >
      {title && (
        <div className="h-14 min-h-[56px] px-4 border-b border-[var(--ods-border)] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {Icon && (
              <span className="w-8 h-8 shrink-0 rounded-[8px] flex items-center justify-center bg-blue-500/15 text-blue-600">
                <Icon className="w-4 h-4" />
              </span>
            )}
            {typeof subtitle === "string" || subtitle === undefined ? (
              <SectionTitle title={title} pill={subtitle} info={info} />
            ) : (
              <>
                <SectionTitle title={title} info={info} />
                <span className="flex-shrink-0">{subtitle}</span>
              </>
            )}
          </div>
          {action && <div className="flex-shrink-0 ml-2">{action}</div>}
        </div>
      )}
      <div className="p-3 md:p-4 flex-1 overflow-auto">{children}</div>
    </div>
  );
}
