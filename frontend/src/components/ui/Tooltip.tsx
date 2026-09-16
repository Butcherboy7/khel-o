'use client';

import { useState, useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      <span aria-describedby={visible ? id : undefined}>{children}</span>
      {visible && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-xs -translate-x-1/2 rounded-lg',
            'bg-secondary px-2.5 py-1.5 text-xs font-medium text-white shadow-lg',
            className,
          )}
        >
          {content}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-secondary" />
        </span>
      )}
    </span>
  );
}
