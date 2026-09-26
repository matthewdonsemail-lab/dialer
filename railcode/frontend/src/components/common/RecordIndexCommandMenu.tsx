import React from 'react';
import { Pencil, Trash2, X } from 'lucide-react';

interface RecordIndexCommandMenuProps {
  selectedCount: number;
  onClear: () => void;
  onDelete: () => void;
  onEdit?: () => void;
}

export const RecordIndexCommandMenu: React.FC<RecordIndexCommandMenuProps> = ({
  selectedCount,
  onClear,
  onDelete,
  onEdit,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-[13px] text-[var(--ods-text-secondary)]">
        <span className="font-medium text-[var(--ods-text-primary)]">{selectedCount}</span>
        <span>selected</span>
        <button
          onClick={onClear}
          className="ml-1 p-0.5 text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] rounded transition-colors"
          title="Clear selection (Esc)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="h-4 w-[1px] bg-[var(--ods-border)] mx-1" />

      {onEdit && (
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 h-7 px-2 text-[12px] font-medium text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-black/[0.04] rounded-[4px] border border-[var(--ods-border)] transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
      )}

      <button
        onClick={onDelete}
        className="inline-flex items-center gap-1.5 h-7 px-2 text-[12px] font-medium text-red-600 hover:bg-red-50 hover:border-red-200 rounded-[4px] border border-[var(--ods-border)] transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>
  );
};
