import React from 'react';
import { X } from "@/components/ui/icons";
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className={cn(
          'bg-[var(--ods-bg-primary)] rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto',
          className
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--ods-border)]">
          {title && (
            <h2 className="text-lg font-semibold text-[var(--ods-text-primary)]">{title}</h2>
          )}
          <button
            onClick={onClose}
            className="text-[var(--ods-text-tertiary)] hover:text-[var(--ods-text-secondary)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && (
          <div className="px-5 py-4 border-t border-[var(--ods-border)] bg-[var(--ods-bg-secondary)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
