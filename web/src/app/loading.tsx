import { Skeleton, SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';

export default function RootLoading() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-8) var(--space-4)', minHeight: '60vh' }}>
      <div style={{ marginBottom: 'var(--space-8)', textAlign: 'center' }}>
        <Skeleton width="220px" height="32px" borderRadius="var(--radius-full)" className="mx-auto" />
        <div style={{ height: '16px' }} />
        <Skeleton width="60%" height="40px" borderRadius="var(--radius-lg)" />
        <div style={{ height: '12px' }} />
        <SkeletonText lines={2} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-6)' }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
