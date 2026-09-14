/* Hallmark · genre: modern-minimal · surface: warm-near-white, hairline border */

import type { ReactNode } from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
  padded?: boolean;
}

export function Card({
  children,
  className,
  bordered = true,
  padded = true,
}: CardProps) {
  return (
    <div
      className={clsx(
        'bg-panel rounded-card',
        bordered && 'border border-line',
        padded && 'p-4',
        className,
      )}
    >
      {children}
    </div>
  );
}