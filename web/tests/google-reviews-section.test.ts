import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getGoogleReviews, parsePlaceReviews, GOOGLE_REVIEW_URL, REVIEW_PATH } from '@/lib/google-reviews';
import { GET as reviewRedirect } from '@/app/review/route';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#14): "a prominent section on the homepage for genuine Google
// customer reviews, with the appropriate review links and attribution. Only verified, authentic
// reviews should be displayed."
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
const originalEnv = { ...process.env };

const place = {
  rating: 4.86,
  userRatingCount: 23,
  googleMapsUri: 'https://maps.google.com/?cid=123',
  reviews: [
    {
      rating: 5,
      text: { text: '  Shirts came back perfect.  ', languageCode: 'en' },
      relativePublishTimeDescription: '2 weeks ago',
      authorAttribution: { displayName: 'Dana L.', uri: 'https://www.google.com/maps/contrib/1', photoUri: 'https://lh3.googleusercontent.com/a/x' },
    },
    { rating: 2, text: { text: 'Pickup was late.' }, authorAttribution: { displayName: 'Sam K.', uri: 'javascript:alert(1)' } },
    { rating: 5, authorAttribution: { displayName: 'Stars only' } },
  ],
};

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe('Google reviews on the homepage', () => {
  it("shows Google's reviews as they come, low ratings too, with each author", () => {
    const s = parsePlaceReviews(place);
    expect(s.rating).toBe(4.9);
    expect(s.count).toBe(23);
    expect(s.listingUrl).toBe('https://maps.google.com/?cid=123');
    expect(s.reviews).toEqual([
      { author: 'Dana L.', authorUrl: 'https://www.google.com/maps/contrib/1', authorPhoto: 'https://lh3.googleusercontent.com/a/x', rating: 5, text: 'Shirts came back perfect.', when: '2 weeks ago' },
      // Not left out for its rating; a link that isn't https is dropped
      { author: 'Sam K.', authorUrl: null, authorPhoto: null, rating: 2, text: 'Pickup was late.', when: '' },
    ]);
    expect(parsePlaceReviews(null)).toEqual({ rating: null, count: 0, reviews: [], listingUrl: null });
  });

  it('reads the Places API only when the Place ID and key are set, cached for 6 hours', async () => {
    delete process.env.GOOGLE_PLACE_ID;
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(place), { status: 200 }));
    expect(await getGoogleReviews()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    process.env.GOOGLE_PLACE_ID = 'ChIJ_test_place_id_123';
    expect((await getGoogleReviews())?.count).toBe(23);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit & { next?: { revalidate: number } }];
    expect(url).toBe('https://places.googleapis.com/v1/places/ChIJ_test_place_id_123?languageCode=en');
    expect((init.headers as Record<string, string>)['X-Goog-FieldMask']).toBe('rating,userRatingCount,reviews,googleMapsUri');
    expect(init.next?.revalidate).toBe(21600);

    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));
    expect(await getGoogleReviews()).toBeNull();
    process.env.GOOGLE_PLACE_ID = '../../etc';
    expect(await getGoogleReviews()).toBeNull();
  });

  it('the homepage shows the section, names Google as the source, and always links to write one', () => {
    expect(read('src/app/page.tsx')).toContain('<GoogleReviewsSection summary={reviews} />');
    const section = read('src/components/marketing/GoogleReviewsSection.tsx');
    expect(section).toContain('summary?.reviews.slice(0, HOMEPAGE_REVIEW_COUNT)');
    expect(section).not.toMatch(/\.filter\(/);
    expect(section).toContain('Reviews from Google Maps.');
    expect(section).toContain('href={GOOGLE_REVIEW_URL}');
    expect(section).toContain('Read all reviews on Google');
    // Google's author photos may load
    expect(read('next.config.ts')).toMatch(/img-src[^;]*https:\/\/\*\.googleusercontent\.com/);
  });

  it('/review opens the Google review page', () => {
    expect(REVIEW_PATH).toBe('/review');
    const res = reviewRedirect();
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(GOOGLE_REVIEW_URL);
  });
});
