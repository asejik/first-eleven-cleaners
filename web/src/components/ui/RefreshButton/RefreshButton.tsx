'use client';

import { useState, useCallback } from 'react';
import styles from './RefreshButton.module.css';

export interface RefreshButtonProps {
  /**
   * Action triggered when the user clicks the refresh button.
   * Can be synchronous or return a Promise.
   */
  onRefresh: () => Promise<unknown> | void;
  /**
   * External loading/fetching indicator (e.g. isFetching from react-query)
   */
  isRefreshing?: boolean;
  /**
   * Optional text label displayed next to the icon.
   * Defaults to "Refresh". Pass empty string or null to display icon only.
   */
  label?: string | null;
  /**
   * Size token: 'sm' (compact) or 'md' (standard)
   */
  size?: 'sm' | 'md';
  /**
   * Visual theme variant
   */
  variant?: 'outline' | 'ghost' | 'ghostLight' | 'glass';
  /**
   * Optional additional CSS classes
   */
  className?: string;
  /**
   * Optional title tooltip text
   */
  title?: string;
}

export function RefreshButton({
  onRefresh,
  isRefreshing = false,
  label = 'Refresh',
  size = 'sm',
  variant = 'outline',
  className = '',
  title = 'Force refresh live data',
}: RefreshButtonProps) {
  const [localRefreshing, setLocalRefreshing] = useState(false);

  const isSpinning = isRefreshing || localRefreshing;

  const handleClick = useCallback(async () => {
    if (isSpinning) return;
    setLocalRefreshing(true);
    const minDelay = new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await Promise.all([Promise.resolve(onRefresh()), minDelay]);
    } catch (err) {
      console.error('Refresh error:', err);
    } finally {
      setLocalRefreshing(false);
    }
  }, [isSpinning, onRefresh]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSpinning}
      title={title}
      aria-label={label || title}
      className={`${styles.refreshButton} ${styles[variant]} ${styles[size]} ${className}`.trim()}
    >
      <span className={`${styles.iconWrapper} ${isSpinning ? styles.spinning : ''}`} aria-hidden="true">
        <svg
          className={styles.icon}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.19" />
        </svg>
      </span>
      {label && <span>{isSpinning ? 'Refreshing...' : label}</span>}
    </button>
  );
}
