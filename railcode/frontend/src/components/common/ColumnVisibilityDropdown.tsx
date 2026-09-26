import React, { useState, useRef, useEffect } from 'react';
import { Columns3, Check } from 'lucide-react';

export interface ColumnDef {
  key: string;
  label: string;
  visible: boolean;
}

interface ColumnVisibilityDropdownProps {
  columns: ColumnDef[];
  onChange: (key: string, visible: boolean) => void;
}

export const ColumnVisibilityDropdown: React.FC<ColumnVisibilityDropdownProps> = ({
  columns,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  return (
    <div className="relative inline-block text-left" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-7 px-2 text-[12px] font-medium text-[var(--ods-text-secondary)] hover:text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)] rounded-[4px] border border-[var(--ods-border)] transition-colors"
      >
        <Columns3 className="w-3.5 h-3.5" />
        <span>fields</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] shadow-lg py-1 z-40 text-[12px]">
          <div className="px-2 py-1 text-[11px] font-semibold text-[var(--ods-text-tertiary)] uppercase tracking-wider border-b border-[var(--ods-border)] mb-1">
            toggle columns
          </div>
          {columns.map((col) => (
            <button
              key={col.key}
              onClick={() => onChange(col.key, !col.visible)}
              className="flex items-center justify-between w-full px-2.5 py-1 text-left text-[var(--ods-text-primary)] hover:bg-[var(--ods-bg-secondary)]"
            >
              <span>{col.label}</span>
              <div
                className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center ${
                  col.visible
                    ? 'bg-[var(--ods-brand-600)] border-[var(--ods-brand-600)] text-white'
                    : 'border-[var(--ods-border)] bg-transparent'
                }`}
              >
                {col.visible && <Check className="w-2.5 h-2.5 stroke-[3]" />}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
