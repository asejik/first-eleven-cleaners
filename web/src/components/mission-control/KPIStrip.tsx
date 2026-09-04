import { Badge } from '@/components/ui';
import styles from '@/app/mission-control/page.module.css';

interface KPIStripProps {
  stats?: {
    active_count?: number;
    total_count?: number;
    today_revenue?: number;
    total_lbs?: number;
    total_pieces?: number;
    labor?: {
      status?: string;
      current_pct?: number;
      target_max_pct?: number;
      estimated_cost?: number;
    };
  } | null;
}

export function KPIStrip({ stats }: KPIStripProps) {
  const labor = stats?.labor;
  const isOptimal = labor?.status === 'optimal';
  const currentPct = labor?.current_pct ?? 0;
  const targetMaxPct = labor?.target_max_pct ?? 32;
  const estimatedCost = labor?.estimated_cost ?? 0;

  return (
    <div className={styles.kpiGrid}>
      <div className={styles.kpiCard}>
        <span className={styles.kpiLabel}>Active Plant Volume</span>
        <span className={styles.kpiValue}>{stats?.active_count ?? 0} Orders</span>
        <span className={styles.kpiSub}>{stats?.total_count ?? 0} all-time orders recorded</span>
      </div>

      <div className={styles.kpiCard}>
        <span className={styles.kpiLabel}>Today&apos;s Estimated Sales</span>
        <span className={styles.kpiValue}>${(stats?.today_revenue ?? 0).toFixed(2)}</span>
        <span className={styles.kpiSub}>Total Plant Volume: {stats?.total_lbs ?? 0} lbs</span>
      </div>

      <div className={styles.kpiCard}>
        <span className={styles.kpiLabel}>Dry Clean Pieces</span>
        <span className={styles.kpiValue}>{stats?.total_pieces ?? 0} Garments</span>
        <span className={styles.kpiSub}>Inspected & hand-pressed</span>
      </div>

      {/* Real-Time Labor Benchmark */}
      <div className={styles.laborBarCard}>
        <div className={styles.laborBarHeader}>
          <span className={styles.kpiLabel}>Labor Benchmark Target</span>
          <Badge variant={isOptimal ? 'success' : 'error'}>
            {currentPct}% (Max: {targetMaxPct}%)
          </Badge>
        </div>
        <div className={styles.laborTrack}>
          <div
            className={`${styles.laborFill} ${
              isOptimal ? styles.laborFillOptimal : styles.laborFillAlert
            }`}
            style={{ width: `${Math.min(100, (currentPct || 28) * 2)}%` }}
          />
        </div>
        <span className={styles.kpiSub}>
          Est. Labor: ${estimatedCost.toFixed(2)} • Labor ≤ 32% of net sales
        </span>
      </div>
    </div>
  );
}
