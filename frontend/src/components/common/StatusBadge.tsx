import React from 'react';
import { Badge } from '@/components/ui/Badge';

interface StatusBadgeProps {
  status: string;
}

const statusVariants: Record<string, 'blue' | 'green' | 'amber' | 'red' | 'gray' | 'purple'> = {
  new: 'blue',
  contacted: 'blue',
  interested: 'amber',
  not_interested: 'gray',
  callback: 'purple',
  converted: 'green',
  do_not_contact: 'red',
  active: 'green',
  paused: 'amber',
  scheduled: 'blue',
  completed: 'green',
  cancelled: 'red',
  rescheduled: 'amber',
  // Call dispositions. Keys are matched case-insensitively: agencyCalls.status
  // is persisted uppercase (COMPLETED/VOICEMAIL/...) while the softphone
  // outcomes are lowercase, so a case-sensitive lookup always missed and fell
  // back to gray.
  connected: 'blue',
  answered: 'green',
  no_answer: 'gray',
  busy: 'red',
  voicemail: 'amber',
  dnc: 'red',
  wrong_number: 'gray',
  disconnected: 'gray',
  in_progress: 'blue',
  failed: 'red',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = statusVariants[String(status ?? '').toLowerCase()] ?? 'gray';
  const label = String(status ?? '').toLowerCase().replace(/_/g, ' ');

  return (
    <Badge variant={variant} size="sm" className="max-w-full">
      <span className="truncate" title={label}>
        {label}
      </span>
    </Badge>
  );
}
