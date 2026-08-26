import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Badge.module.css';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'booked' | 'picked_up' | 'weighed' | 'cleaning' | 'out_for_delivery' | 'delivered';
  size?: 'sm' | 'md';
  dot?: boolean;
  children: ReactNode;
}

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  children,
  className = '',
  ...props
}: BadgeProps) {
  return (
    <span
      className={`${styles.badge} ${styles[variant]} ${styles[size]} ${className}`}
      {...props}
    >
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
