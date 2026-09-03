import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';

export default function PricingLoading() {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: 'var(--space-12) var(--space-4)', minHeight: '80vh' }}>
      <div style={{ textAlign: 'center', marginBottom: 'var(--space-10)' }}>
        <Skeleton width="180px" height="28px" borderRadius="var(--radius-full)" className="mx-auto" />
        <div style={{ height: '16px' }} />
        <Skeleton width="50%" height="38px" borderRadius="var(--radius-md)" />
        <div style={{ height: '10px' }} />
        <Skeleton width="40%" height="18px" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-8)' }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
