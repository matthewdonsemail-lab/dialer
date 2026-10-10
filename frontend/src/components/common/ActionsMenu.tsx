import React, { useState } from "react";
import { Copy, MoreHorizontal, Pencil, Trash2, Eye } from "@/components/ui/icons";
import { AnchoredMenu } from "@/components/ui/Menu";
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

  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);

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
        ref={setAnchor}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((o) => !o);
        }}
        className="ods-menu-trigger w-7 h-7 inline-flex items-center justify-center border border-transparent text-[var(--ods-text-secondary)] hover:text-[var(--ods-brand-600)] rounded-[6px]"
        aria-expanded={isOpen}
        title="Actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {isOpen && anchor && (
        <AnchoredMenu anchor={anchor} onClose={() => setIsOpen(false)} placement="bottom-end" className="w-48">
          {onView && (
            <button
              onClick={() => { onView(leadId); setIsOpen(false); }}
              className="ods-menu-item"
            >
              <Eye className="ods-menu-icon" />
              View
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => { onEdit(leadId); setIsOpen(false); }}
              className="ods-menu-item"
            >
              <Pencil className="ods-menu-icon" />
              Edit
            </button>
          )}
          {data && (
            <button
              onClick={handleCopyJson}
              className="ods-menu-item"
            >
              <Copy className="ods-menu-icon" />
              Copy JSON
            </button>
          )}
          <button
            onClick={() => { onDelete?.(leadId, leadName); setIsOpen(false); }}
            className="ods-menu-item ods-menu-item--danger"
          >
            <Trash2 className="ods-menu-icon !text-current" />
            Delete
          </button>
        </AnchoredMenu>
      )}
    </>
  );
}
