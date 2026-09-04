import { Badge, Button } from '@/components/ui';
import type { Claim } from '@/types';
import styles from '@/app/mission-control/page.module.css';

interface ClaimsQueueProps {
  claims: Claim[];
  onSelectClaim: (claim: Claim) => void;
}

export function ClaimsQueue({ claims, onSelectClaim }: ClaimsQueueProps) {
  return (
    <div className={styles.sectionBlock}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          <span>🛡️</span> Make It Right Resolution Queue ({claims.length})
        </h3>
      </div>

      {claims.length === 0 ? (
        <p style={{ fontSize: 'var(--text-xs)', color: '#94a3b8' }}>
          ✨ Zero open claims. All customer pickups in perfect standing.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {claims.map((claim) => (
            <div
              key={claim.id}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 'var(--radius-lg)',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', color: 'var(--color-gold)' }}>
                    Claim #{claim.id.slice(0, 8)}
                  </span>
                  <Badge variant={claim.status === 'resolved' || claim.status === 'refunded' ? 'success' : 'warning'}>
                    {claim.status.toUpperCase()}
                  </Badge>
                </div>
                <p style={{ fontSize: 'var(--text-xs)', color: '#f1f5f9', margin: '4px 0 2px' }}>
                  <strong>Issue:</strong> {claim.issue_type.toUpperCase()} • &ldquo;{claim.description}&rdquo;
                </p>
                <span style={{ fontSize: 'var(--text-2xs)', color: '#94a3b8' }}>
                  Order #{claim.order?.order_number || claim.order_id?.slice(0, 8)} • Customer: {claim.customer?.full_name}
                </span>
              </div>

              {claim.status === 'open' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onSelectClaim(claim)}
                >
                  Resolve / Refund
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
