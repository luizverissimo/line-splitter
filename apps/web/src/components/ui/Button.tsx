import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger';
  /** Mostra spinner, desabilita e anuncia "ocupado" enquanto uma ação está em andamento. */
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'default',
  loading = false,
  icon,
  children,
  disabled,
  className,
  ...rest
}: Props) {
  const classes = ['btn', variant !== 'default' ? `btn-${variant}` : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      {...rest}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner size={16} label={null} /> : icon}
      {children}
    </button>
  );
}
