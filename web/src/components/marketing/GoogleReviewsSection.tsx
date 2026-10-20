import { ExternalLink, Star } from 'lucide-react';
import { ButtonLink } from '@/components/ui';
import { GOOGLE_REVIEW_URL, HOMEPAGE_REVIEW_COUNT, type GoogleReviewSummary } from '@/lib/google-reviews';
import styles from './GoogleReviewsSection.module.css';

/**
 * The homepage's Google reviews (client review 2026-10-20, #14): the listing's rating and its
 * latest reviews as Google returns them, each with its author, and Google named as the source.
 * With no reviews to show, it only asks customers to write one; nothing is ever made up.
 */
function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <span className={styles.stars} role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} strokeWidth={1.5} aria-hidden="true" className={n <= Math.round(rating) ? styles.starOn : styles.starOff} />
      ))}
    </span>
  );
}

export function GoogleReviewsSection({ summary }: { summary: GoogleReviewSummary | null }) {
  const reviews = summary?.reviews.slice(0, HOMEPAGE_REVIEW_COUNT) ?? [];
  const hasReviews = reviews.length > 0;

  return (
    <section className={styles.section} aria-labelledby="reviews-heading">
      <div className={styles.container}>
        <h2 id="reviews-heading" className={styles.title}>
          {hasReviews ? 'What Our Customers Say' : 'Reviewed on Google'}
        </h2>

        {hasReviews && summary?.rating && summary.count > 0 ? (
          <p className={styles.summary}>
            <Stars rating={summary.rating} size={20} />
            <span>
              <strong>{summary.rating.toFixed(1)}</strong> from {summary.count} Google {summary.count === 1 ? 'review' : 'reviews'}
            </span>
          </p>
        ) : (
          <p className={styles.subtitle}>
            Our reviews live on Google, written by real customers. Had a pickup with us? Tell your neighbors how it went.
          </p>
        )}

        {hasReviews && (
          <ul className={styles.grid}>
            {reviews.map((r, i) => (
              <li key={`${r.author}-${i}`} className={styles.card}>
                <Stars rating={r.rating} />
                <p className={styles.text}>{r.text}</p>
                <div className={styles.author}>
                  {r.authorPhoto && (
                    // Google's own author photo, shown as part of the review's attribution
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.authorPhoto} alt="" width={32} height={32} className={styles.avatar} referrerPolicy="no-referrer" loading="lazy" />
                  )}
                  <span>
                    {r.authorUrl ? (
                      <a href={r.authorUrl} target="_blank" rel="noopener noreferrer nofollow" className={styles.authorName}>
                        {r.author}
                      </a>
                    ) : (
                      <span className={styles.authorName}>{r.author}</span>
                    )}
                    {r.when && <span className={styles.when}> · {r.when}</span>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          {hasReviews && summary?.listingUrl && (
            <ButtonLink href={summary.listingUrl} target="_blank" rel="noopener noreferrer" variant="outline" size="lg">
              Read all reviews on Google <ExternalLink size={16} strokeWidth={2} aria-hidden="true" style={{ marginLeft: 6 }} />
            </ButtonLink>
          )}
          <ButtonLink href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer" variant="primary" size="lg">
            Write a Google review
          </ButtonLink>
        </div>
        {hasReviews && <p className={styles.source}>Reviews from Google Maps.</p>}
      </div>
    </section>
  );
}
