import styles from '@/app/mission-control/page.module.css';

interface KPIStripProps {
  stats?: {
    active_count?: number;
    total_count?: number;
    today_revenue?: number;
    total_lbs?: number;
    total_pieces?: number;
  } | null;
}

export function KPIStrip({ stats }: KPIStripProps) {
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

    </div>
  );
}
