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
  answered: 'green',
  no_answer: 'gray',
  busy: 'red',
  voicemail: 'amber',
  dnc: 'red',
  wrong_number: 'gray',
  disconnected: 'gray',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = statusVariants[status] ?? 'gray';
  const label = status.replace(/_/g, ' ');

  return (
    <Badge variant={variant} size="sm">
      {label}
    </Badge>
  );
}
