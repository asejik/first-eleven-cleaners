import Image from 'next/image';
import { RefreshButton, ButtonLink } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from '@/app/mission-control/page.module.css';

interface OpsHeaderProps {
  onRefresh?: () => Promise<unknown> | void;
}

export function OpsHeader({ onRefresh }: OpsHeaderProps) {
  return (
    <div className={styles.topBar}>
      <div className={styles.brandCol}>
        <Image
          src="/icon.webp"
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
        {onRefresh && (
          <RefreshButton
            onRefresh={onRefresh}
            size="sm"
            variant="glass"
          />
        )}
        <ButtonLink href={ROUTES.intake} variant="primary" size="sm">
          ⚖️ Central Intake Station
        </ButtonLink>
        <ButtonLink href={ROUTES.staffDriver} variant="outlineLight" size="sm">
          🚐 Driver Mobile App
        </ButtonLink>
        <ButtonLink href={`${ROUTES.dashboard}?view=customer`} variant="ghostLight" size="sm">
          Customer View
        </ButtonLink>
      </div>
    </div>
  );
}
