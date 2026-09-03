import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';

export default function TrackOrderLoading() {
  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: 'var(--space-8) var(--space-4)', minHeight: '80vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
        <Skeleton width="180px" height="40px" borderRadius="var(--radius-md)" />
        <div style={{ height: '12px' }} />
        <Skeleton width="240px" height="28px" />
        <div style={{ height: '8px' }} />
        <Skeleton width="160px" height="16px" />
      </div>

      <div style={{ background: '#ffffff', borderRadius: 'var(--radius-2xl)', border: '1px solid #e2e8f0', padding: 'var(--space-8)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <Skeleton width="40px" height="40px" borderRadius="var(--radius-full)" />
              <Skeleton width="50px" height="12px" />
            </div>
          ))}
        </div>

        <div style={{ height: '16px' }} />
        <SkeletonText lines={3} />
        <div style={{ height: '24px' }} />
        <Skeleton height="48px" borderRadius="var(--radius-lg)" />
      </div>
    </div>
  );
}
