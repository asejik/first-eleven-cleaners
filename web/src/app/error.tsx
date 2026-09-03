'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import styles from './error.module.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Log error to console or error_logs table
    console.error('Unhandled Client Error:', error);
  }, [error]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <span className={styles.icon}>⚠️</span>
        <h1 className={styles.title}>Temporary Stoppage in Play</h1>
        <p className={styles.description}>
          An unexpected error occurred while loading this experience. Our technical team has been notified.
        </p>
        <div className={styles.actions}>
          <Button variant="primary" size="lg" onClick={() => reset()}>
            🔄 Try Again
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => router.push('/')}
          >
            Return to Home
          </Button>
        </div>
      </div>
    </div>
  );
}
