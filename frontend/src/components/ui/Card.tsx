import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  padding?: 'sm' | 'md' | 'lg';
}

const paddingClasses: Record<string, string> = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({
  title,
  description,
  children,
  className,
  padding = 'md',
}: CardProps) {
  return (
    <div
      className={cn(
        'bg-[var(--ods-bg-primary)] rounded-lg border border-[var(--ods-border)] shadow-sm',
        paddingClasses[padding],
        className
      )}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-lg font-semibold text-[var(--ods-text-primary)]">{title}</h3>
          )}
          {description && (
            <p className="text-sm text-[var(--ods-text-secondary)] mt-1">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
