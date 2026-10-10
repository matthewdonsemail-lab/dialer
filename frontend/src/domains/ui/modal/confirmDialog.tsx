import React from 'react';
import { AlertTriangle } from "@/domains/ui/icons";
import { Modal } from './modal';
import { Button } from '@/domains/ui/legacyButton';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={`p-2 rounded-[8px] ${
            variant === 'danger' ? 'bg-red-100' : 'bg-amber-100'
          }`}
        >
          <AlertTriangle
            className={`w-5 h-5 ${
              variant === 'danger' ? 'text-red-600' : 'text-amber-600'
            }`}
          />
        </div>
        <div>
          <p className="text-[14px] text-[var(--ods-text-secondary)] mt-1">{message}</p>
        </div>
      </div>
    </Modal>
  );
}
