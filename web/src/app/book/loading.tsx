import { Skeleton } from '@/components/ui/Skeleton';

export default function BookLoading() {
  return (
    <div style={{ backgroundColor: 'var(--color-cream)', minHeight: 'calc(100vh - var(--header-height))', padding: 'var(--space-8) var(--space-4) var(--space-16)' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        {/* Stepper Skeleton */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-6)', padding: '0 10px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <Skeleton width="32px" height="32px" borderRadius="var(--radius-full)" />
              <Skeleton width="48px" height="12px" />
            </div>
          ))}
        </div>

        {/* Form Card Skeleton */}
        <div style={{ backgroundColor: '#ffffff', borderRadius: 'var(--radius-2xl)', border: '1px solid #e2e8f0', padding: 'var(--space-8)' }}>
          <Skeleton width="50%" height="28px" borderRadius="var(--radius-md)" />
          <div style={{ height: '8px' }} />
          <Skeleton width="75%" height="16px" />
          <div style={{ height: '24px' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Skeleton height="44px" borderRadius="var(--radius-md)" />
            <Skeleton height="44px" borderRadius="var(--radius-md)" />
            <Skeleton height="44px" borderRadius="var(--radius-md)" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Skeleton height="44px" borderRadius="var(--radius-md)" />
              <Skeleton height="44px" borderRadius="var(--radius-md)" />
            </div>
          </div>

          <div style={{ height: '28px' }} />
          <Skeleton height="50px" borderRadius="var(--radius-lg)" />
        </div>
      </div>
    </div>
  );
}
