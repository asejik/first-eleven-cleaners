import { Skeleton } from '@/components/ui/Skeleton';

export default function MissionControlLoading() {
  return (
    <div style={{ backgroundColor: '#0f172a', minHeight: 'calc(100vh - var(--header-height))', padding: 'var(--space-6) var(--space-4)' }}>
      <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
        {/* Top Bar Skeleton */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Skeleton width="44px" height="44px" borderRadius="10px" />
            <div>
              <Skeleton width="220px" height="24px" />
              <div style={{ height: '4px' }} />
              <Skeleton width="340px" height="14px" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Skeleton width="160px" height="36px" borderRadius="var(--radius-md)" />
            <Skeleton width="140px" height="36px" borderRadius="var(--radius-md)" />
          </div>
        </div>

        {/* KPI Grid Skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)' }}>
              <Skeleton width="60%" height="14px" />
              <div style={{ height: '8px' }} />
              <Skeleton width="40%" height="28px" />
              <div style={{ height: '6px' }} />
              <Skeleton width="80%" height="12px" />
            </div>
          ))}
        </div>

        {/* 6-Column Kanban Skeleton */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
          {[1, 2, 3, 4, 5, 6].map((col) => (
            <div key={col} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 'var(--radius-xl)', padding: 'var(--space-4)', minHeight: '380px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <Skeleton width="100px" height="18px" />
                <Skeleton width="28px" height="18px" borderRadius="var(--radius-full)" />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <Skeleton height="70px" borderRadius="var(--radius-lg)" />
                <Skeleton height="70px" borderRadius="var(--radius-lg)" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
