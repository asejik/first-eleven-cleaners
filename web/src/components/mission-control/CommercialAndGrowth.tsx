import Link from 'next/link';
import { Badge, Button } from '@/components/ui';
import { ROUTES } from '@/lib/constants';
import styles from '@/app/mission-control/page.module.css';

export function CommercialAndGrowth() {
  return (
    <div className={styles.sectionBlock}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          <span>🏢</span> Commercial B2B Accounts & Growth Automations
        </h3>
        <Badge variant="success">3 Enterprise Facilities</Badge>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
        <div style={{ background: '#1e293b', padding: '14px', borderRadius: 'var(--radius-lg)', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)' }}>Commercial B2B Volume</strong>
            <Badge variant="info">Net-30</Badge>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: '#ffffff', fontWeight: 'bold', margin: '0 0 2px' }}>
            2,720 lbs Linen & Guest Valet
          </p>
          <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '10px' }}>
            The Joule Hotel, HP MedSpa, Equinox Plano
          </span>
          <Link href={ROUTES.portal}>
            <Button variant="outlineLight" size="sm" fullWidth>
              Open B2B Enterprise Portal →
            </Button>
          </Link>
        </div>

        <div style={{ background: '#1e293b', padding: '14px', borderRadius: 'var(--radius-lg)', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <strong style={{ fontSize: 'var(--text-xs)', color: '#4ade80' }}>Growth & Review Booster</strong>
            <Badge variant="delivered">4.95 ⭐ Rating</Badge>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: '#ffffff', fontWeight: 'bold', margin: '0 0 2px' }}>
            Automated 2-Hr Review Prompt
          </p>
          <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginBottom: '10px' }}>
            Google Review Booster + Churn Win-Back (COMEBACK15)
          </span>
          <Badge variant="booked">Automations Active</Badge>
        </div>
      </div>
    </div>
  );
}
