import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <Image
          src="/icon.png"
          alt="First Eleven Cleaners"
          width={64}
          height={64}
          style={{ borderRadius: '16px', margin: '0 auto var(--space-4)', display: 'block' }}
        />
        <h1 className={styles.code}>404</h1>
        <h2 className={styles.title}>Out of Bounds</h2>
        <p className={styles.description}>
          The page you are looking for has been moved, substituted, or does not exist.
        </p>
        <div className={styles.actions}>
          <Link href={ROUTES.home}>
            <Button variant="primary" size="lg">
              Return to Home Pitch
            </Button>
          </Link>
          <Link href={ROUTES.book}>
            <Button variant="outline" size="lg">
              Schedule a Pickup
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
