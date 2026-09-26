import React, { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react";
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  FloatingPortal,
} from "@floating-ui/react";
import { useToast } from "@/components/ui/Toast";

interface ActionsMenuProps {
  leadId: string;
  leadName: string;
  onView?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string, name: string) => void;
  data?: Record<string, any>;
  onCopy?: () => void;
}

export function ActionsMenu({ leadId, leadName, onView, onEdit, onDelete, data }: ActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { success: showToast } = useToast();

  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(4), flip(), shift({ padding: 8 })],
  });

  const handleCopyJson = () => {
    if (data) {
      navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      showToast?.("Copied", "JSON copied to clipboard");
    }
    setIsOpen(false);
  };

  return (
    <>
      <button
        ref={refs.setReference}
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] rounded-[4px] transition-colors"
        title="Actions"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {isOpen && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            className="z-[100] w-40 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] shadow-lg py-1 text-[12px]"
          >
            {onView && (
              <button
                onClick={() => { onView(leadId); setIsOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] transition-colors"
              >
                <Eye className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                View
              </button>
            )}
            {onEdit && (
              <button
                onClick={() => { onEdit(leadId); setIsOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                Edit
              </button>
            )}
            {data && (
              <button
                onClick={handleCopyJson}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--ods-text-tertiary)]">
                  <rect width="14" height="14" x="8" y="8" rx="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
                Copy JSON
              </button>
            )}
            <button
              onClick={() => { onDelete?.(leadId, leadName); setIsOpen(false); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </button>
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
