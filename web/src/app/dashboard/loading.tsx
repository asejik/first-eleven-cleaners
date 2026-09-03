import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'var(--space-8) var(--space-4)', minHeight: '80vh' }}>
      {/* Top Banner Skeleton */}
      <div style={{ background: '#f8fafc', borderRadius: 'var(--radius-2xl)', border: '1px solid #e2e8f0', padding: 'var(--space-8)', marginBottom: 'var(--space-8)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ flex: 1, minWidth: '240px' }}>
            <Skeleton width="180px" height="18px" />
            <div style={{ height: '8px' }} />
            <Skeleton width="320px" height="32px" borderRadius="var(--radius-md)" />
            <div style={{ height: '8px' }} />
            <Skeleton width="220px" height="16px" />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Skeleton width="160px" height="44px" borderRadius="var(--radius-lg)" />
          </div>
        </div>
      </div>

      {/* Quick Nav Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ background: '#ffffff', borderRadius: 'var(--radius-xl)', border: '1px solid #e2e8f0', padding: 'var(--space-6)' }}>
            <Skeleton width="36px" height="36px" borderRadius="var(--radius-lg)" />
            <div style={{ height: '12px' }} />
            <Skeleton width="60%" height="20px" />
            <div style={{ height: '6px' }} />
            <SkeletonText lines={1} />
          </div>
        ))}
      </div>

      {/* Orders List Skeleton */}
      <div style={{ background: '#ffffff', borderRadius: 'var(--radius-xl)', border: '1px solid #e2e8f0', padding: 'var(--space-6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <Skeleton width="200px" height="24px" />
          <Skeleton width="100px" height="20px" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[1, 2].map((i) => (
            <div key={i} style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <Skeleton width="120px" height="18px" />
                <Skeleton width="80px" height="22px" borderRadius="var(--radius-full)" />
              </div>
              <SkeletonText lines={2} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
