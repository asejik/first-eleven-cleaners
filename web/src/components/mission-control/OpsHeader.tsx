import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from '@/app/mission-control/page.module.css';

export function OpsHeader() {
  return (
    <div className={styles.topBar}>
      <div className={styles.brandCol}>
        <Image
          src="/icon.png"
          alt="First Eleven"
          width={44}
          height={44}
          style={{ borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
        />
        <div>
          <h1 className={styles.title}>Mission Control Ops</h1>
          <p className={styles.subtitle}>
            Dallas Plant & Fleet Command • FIFA 2026 World Cup Heritage Standard
          </p>
        </div>
      </div>
      <div className={styles.topActions}>
        <Link href={ROUTES.intake}>
          <Button variant="primary" size="sm">
            ⚖️ Central Intake Station
          </Button>
        </Link>
        <Link href={ROUTES.staffDriver}>
          <Button variant="outlineLight" size="sm">
            🚐 Driver Mobile App
          </Button>
        </Link>
        <Link href={`${ROUTES.dashboard}?view=customer`}>
          <Button variant="ghostLight" size="sm">
            Customer View
          </Button>
        </Link>
      </div>
    </div>
  );
}
