import { ButtonLink, Card } from '@/components/ui';
import { GOOGLE_REVIEW_URL } from '@/lib/google-reviews';

/**
 * Asks for a Google review once an order is delivered. Shown to every delivered order, not
 * only after "Looks good" (no review gating, see lib/google-reviews.ts).
 */
export function GoogleReviewCard() {
  return (
    <Card variant="bordered" padding="lg" style={{ marginBottom: 'var(--space-6)' }}>
      <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>How did we do?</h2>
      <p style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>
        Share your experience on Google. It takes a minute and helps other DFW customers find us.
      </p>
      <ButtonLink href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer" variant="outline">
        Write a Google review
      </ButtonLink>
    </Card>
  );
}
