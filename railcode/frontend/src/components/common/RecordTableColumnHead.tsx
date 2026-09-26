import React, { useState, useRef, useEffect } from 'react';
import { LucideIcon, ChevronDown, ArrowUp, ArrowDown, EyeOff, ArrowLeft, ArrowRight } from 'lucide-react';

interface RecordTableColumnHeadProps {
  label: string;
  icon: LucideIcon;
  sortDirection?: 'asc' | 'desc' | null;
  onSort?: (direction: 'asc' | 'desc') => void;
  onHide?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
}

export const RecordTableColumnHead: React.FC<RecordTableColumnHeadProps> = ({
  label,
  icon: Icon,
  sortDirection,
  onSort,
  onHide,
  onMoveLeft,
  onMoveRight,
  canMoveLeft = true,
  canMoveRight = true,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex items-center h-full">
      <button
        onClick={() => setOpen(!open)}
        className="group inline-flex items-center gap-1.5 w-full h-8 px-2 text-[11px] font-medium uppercase tracking-wider text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-primary)] hover:bg-black/[0.03] transition-colors"
      >
        <Icon className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)] group-hover:text-[var(--ods-text-secondary)]" />
        <span className="truncate">{label}</span>

        {sortDirection === 'asc' && <ArrowUp className="w-3 h-3 text-[var(--ods-text-primary)] ml-auto" />}
        {sortDirection === 'desc' && <ArrowDown className="w-3 h-3 text-[var(--ods-text-primary)] ml-auto" />}

        {!sortDirection && (
          <ChevronDown className="w-3 h-3 text-[var(--ods-text-tertiary)] opacity-0 group-hover:opacity-100 ml-auto transition-opacity" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-44 z-[60] bg-[var(--ods-bg-primary)] border border-[var(--ods-border)] rounded-[6px] shadow-sm py-1 text-[12px] font-normal text-[var(--ods-text-secondary)]">
          <button
            onClick={() => { onSort?.('asc'); setOpen(false); }}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-black/[0.04] hover:text-[var(--ods-text-primary)] text-left"
          >
            <ArrowUp className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
            Sort ascending
          </button>
          <button
            onClick={() => { onSort?.('desc'); setOpen(false); }}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-black/[0.04] hover:text-[var(--ods-text-primary)] text-left"
          >
            <ArrowDown className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
            Sort descending
          </button>

          <div className="my-1 h-[1px] bg-[var(--ods-border)]" />

          {onMoveLeft && (
            <button
              disabled={!canMoveLeft}
              onClick={() => { onMoveLeft(); setOpen(false); }}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-black/[0.04] hover:text-[var(--ods-text-primary)] text-left disabled:opacity-40 disabled:pointer-events-none"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
              Move left
            </button>
          )}

          {onMoveRight && (
            <button
              disabled={!canMoveRight}
              onClick={() => { onMoveRight(); setOpen(false); }}
              className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-black/[0.04] hover:text-[var(--ods-text-primary)] text-left disabled:opacity-40 disabled:pointer-events-none"
            >
              <ArrowRight className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
              Move right
            </button>
          )}

          {onHide && (
            <>
              <div className="my-1 h-[1px] bg-[var(--ods-border)]" />
              <button
                onClick={() => { onHide(); setOpen(false); }}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 hover:bg-black/[0.04] hover:text-[var(--ods-text-primary)] text-left"
              >
                <EyeOff className="w-3.5 h-3.5 text-[var(--ods-text-tertiary)]" />
                Hide in view
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
