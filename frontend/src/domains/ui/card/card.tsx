import React from 'react';
import { cn } from '@/domains/app/utils';

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
        'bg-[var(--ods-bg-primary)] rounded-[8px] border border-[var(--ods-border)] shadow-sm',
        paddingClasses[padding],
        className
      )}
    >
      {(title || description) && (
        <div className="mb-4">
          {title && (
            <h3 className="text-xl font-semibold text-[var(--ods-text-primary)]">{title}</h3>
          )}
          {description && (
            <p className="text-[14px] text-[var(--ods-text-secondary)] mt-1">{description}</p>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
