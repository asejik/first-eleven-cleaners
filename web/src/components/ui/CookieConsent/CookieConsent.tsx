'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { ROUTES } from '@/lib/constants';
import styles from './CookieConsent.module.css';

const STORAGE_KEY = 'f11_cookie_consent';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

function getSnapshot(): string {
  if (typeof window === 'undefined') return 'dismissed';
  return localStorage.getItem(STORAGE_KEY) || 'unanswered';
}

function getServerSnapshot(): string {
  return 'dismissed';
}

export function CookieConsent() {
  const status = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (status !== 'unanswered') {
    return null;
  }

  const handleChoice = (choice: 'all' | 'essential') => {
    localStorage.setItem(STORAGE_KEY, choice);
    window.dispatchEvent(new Event('storage'));
  };

  return (
    <aside
      className={styles.banner}
      role="region"
      aria-label="Cookie and Privacy Notice"
    >
      <div className={styles.header}>
        <span className={styles.badge}>Texas TDPSA Notice</span>
        <h2 className={styles.title}>Privacy &amp; Cookie Preferences</h2>
      </div>
      <p className={styles.description}>
        We use essential cookies to maintain secure sessions and remember garment care preferences. Under the Texas Data Privacy and Security Act, you have full control over optional analytics.
        <Link href={ROUTES.privacy} className={styles.link}>
          Read Privacy Policy
        </Link>
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => handleChoice('all')}
          className={styles.acceptBtn}
        >
          Accept All Cookies
        </button>
        <button
          type="button"
          onClick={() => handleChoice('essential')}
          className={styles.essentialBtn}
        >
          Essential Only
        </button>
      </div>
    </aside>
  );
}
