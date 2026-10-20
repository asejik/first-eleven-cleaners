/**
 * The Google Business Profile review link (client 2026-10-20). The QR code the client printed
 * opens the same link. Every customer with a delivered order is asked the same way, whatever
 * they told us: Google does not allow asking only happy customers ("review gating").
 */
export const GOOGLE_REVIEW_URL = 'https://g.page/r/CYtBj4hybBFbEBM/review';

/**
 * Our own short link to the review page (/review): the review request message's tracked link
 * leads here, since tracked links only open our own pages, and it fits on cards and receipts.
 */
export const REVIEW_PATH = '/review';

/**
 * The homepage's Google reviews (client review 2026-10-20, #14: "genuine Google customer
 * reviews ... with the appropriate review links and attribution"). Read from the Places API
 * (New) for the listing in GOOGLE_PLACE_ID, with the server key GOOGLE_MAPS_API_KEY (Places API
 * (New) enabled on it), kept for 6 hours. Shown as Google returns them: no review is picked or
 * left out by rating. Without the Place ID, or if Google can't be reached, the section only
 * invites a review.
 */
export interface GoogleReview {
  author: string;
  authorUrl: string | null;
  authorPhoto: string | null;
  rating: number;
  text: string;
  /** "2 weeks ago", as Google words it */
  when: string;
}

export interface GoogleReviewSummary {
  rating: number | null;
  count: number;
  reviews: GoogleReview[];
  /** The listing on Google Maps, where every review can be read */
  listingUrl: string | null;
}

export const HOMEPAGE_REVIEW_COUNT = 3;
const REVIEWS_CACHE_SECONDS = 6 * 60 * 60;

const httpsOrNull = (value: unknown): string | null => (typeof value === 'string' && value.startsWith('https://') ? value : null);

/** The Places API (New) place details response, as the homepage shows it */
export function parsePlaceReviews(json: unknown): GoogleReviewSummary {
  const place = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  const raw = Array.isArray(place.reviews) ? (place.reviews as Record<string, unknown>[]) : [];
  const reviews = raw.flatMap((r): GoogleReview[] => {
    const author = (r.authorAttribution ?? {}) as Record<string, unknown>;
    const text = ((r.text ?? r.originalText ?? {}) as Record<string, unknown>).text;
    const rating = Number(r.rating);
    if (typeof text !== 'string' || !text.trim() || !Number.isFinite(rating) || typeof author.displayName !== 'string') return [];
    return [
      {
        author: author.displayName,
        authorUrl: httpsOrNull(author.uri),
        authorPhoto: httpsOrNull(author.photoUri),
        rating: Math.min(5, Math.max(1, Math.round(rating))),
        text: text.trim(),
        when: typeof r.relativePublishTimeDescription === 'string' ? r.relativePublishTimeDescription : '',
      },
    ];
  });
  const rating = Number(place.rating);
  return {
    rating: Number.isFinite(rating) && rating > 0 ? Math.round(rating * 10) / 10 : null,
    count: Number.isInteger(place.userRatingCount) ? (place.userRatingCount as number) : 0,
    reviews,
    listingUrl: httpsOrNull(place.googleMapsUri),
  };
}

/** The listing's rating and reviews, or null when not set up or Google can't be reached (server only) */
export async function getGoogleReviews(): Promise<GoogleReviewSummary | null> {
  const placeId = process.env.GOOGLE_PLACE_ID?.trim();
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!placeId || !apiKey || !/^[A-Za-z0-9_-]{10,300}$/.test(placeId)) return null;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'rating,userRatingCount,reviews,googleMapsUri' },
      next: { revalidate: REVIEWS_CACHE_SECONDS },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn(`Google reviews: Places API returned ${res.status}`);
      return null;
    }
    return parsePlaceReviews(await res.json());
  } catch (err) {
    console.warn('Google reviews: Places API not reached', (err as Error).message);
    return null;
  }
}
