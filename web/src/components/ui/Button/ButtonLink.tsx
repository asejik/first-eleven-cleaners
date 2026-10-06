import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import type { ButtonProps } from './Button';
import styles from './Button.module.css';

type ButtonLinkProps = ComponentProps<typeof Link> &
  Pick<ButtonProps, 'variant' | 'size' | 'fullWidth'> & {
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
  };

/**
 * A link that looks like a Button. Use it instead of <Link><Button/></Link>, which nests
 * a button inside a link: two Tab stops, and screen readers say "link, button" (SR-04).
 */
export function ButtonLink({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  leftIcon,
  rightIcon,
  className = '',
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${fullWidth ? styles.fullWidth : ''} ${className}`}
      {...props}
    >
      {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
      <span>{children}</span>
      {rightIcon && <span className={styles.icon}>{rightIcon}</span>}
    </Link>
  );
}
