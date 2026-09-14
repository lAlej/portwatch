/* Hallmark · genre: modern-minimal · CTA voice: pill primary, square ghost secondary */

import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx } from 'clsx';

type Variant = 'primary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={clsx(
        'inline-flex items-center justify-center gap-1.5 rounded-pill font-medium select-none whitespace-nowrap',
        'transition-colors duration-[var(--dur-micro)] ease-out',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        size === 'sm' ? 'h-7 px-3 text-xs' : 'h-9 px-4 text-sm',
        variant === 'primary' &&
          'bg-accent text-accent-ink hover:bg-accent-soft',
        variant === 'ghost' &&
          'text-muted hover:text-ink hover:bg-raised',
        variant === 'subtle' &&
          'bg-panel border border-line text-ink hover:bg-raised',
        variant === 'danger' &&
          'text-state-error hover:bg-state-error/10',
        className,
      )}
    >
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  danger?: boolean;
}

export function IconButton({
  danger,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      className={clsx(
        'h-9 w-9 grid place-items-center rounded-md text-muted',
        'transition-colors duration-[var(--dur-micro)] ease-out',
        danger
          ? 'hover:text-state-error hover:bg-state-error/10'
          : 'hover:text-ink hover:bg-raised',
        className,
      )}
    >
      {children}
    </button>
  );
}