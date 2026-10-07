import { createAdminClient } from '@/lib/supabase/admin';
import { reportError } from '@/lib/error-reporting';
import { COVERAGE_HUB } from '@/lib/constants';
import { isListedMetroZip, resolveCoverage, type Coverage, type CoverageResolution } from '@/lib/coverage';

/**
 * Driving distance from the hub (client 2026-10-07, 8A), with the Google Maps Routes API
 * (GOOGLE_MAPS_API_KEY, server only). Each address is looked up once: the miles are kept in
 * distance_cache. Without a key, or if Google doesn't answer within a few seconds, it returns
 * null and coverage falls back to the ZIP code (lib/coverage.ts), so booking never stops.
 */
const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 4000;
const METERS_PER_MILE = 1609.344;

export interface AddressInput {
  street?: string | null;
  city?: string | null;
  zip: string;
}

/** The address Google is asked about: the full street address, or just the ZIP code. */
export function destinationFor({ street, city, zip }: AddressInput): string {
  const zip5 = (zip || '').replace(/[^\d]/g, '').slice(0, 5);
  const streetPart = (street || '').trim();
  if (!streetPart) return `${zip5}, USA`;
  return [streetPart, (city || '').trim(), `TX ${zip5}`].filter(Boolean).join(', ');
}

/** Cache key: lowercase, single spaces, no punctuation that varies between entries. */
export function addressKey(destination: string): string {
  return destination.toLowerCase().replace(/[.#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function drivingMilesFromHub(address: AddressInput): Promise<number | null> {
  const destination = destinationFor(address);
  const key = addressKey(destination);

  if (isSupabaseConfigured()) {
    try {
      const { data } = await createAdminClient().from('distance_cache').select('miles').eq('address_key', key).maybeSingle();
      if (data && Number.isFinite(Number(data.miles))) return Number(data.miles);
    } catch {
      // the cache is an optimization; carry on to the lookup
    }
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  let miles: number | null = null;
  try {
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.distanceMeters',
      },
      body: JSON.stringify({
        origin: { address: COVERAGE_HUB.address },
        destination: { address: destination },
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_UNAWARE',
        units: 'IMPERIAL',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { routes?: Array<{ distanceMeters?: number }>; error?: { message?: string } } | null;
    if (!res.ok) {
      reportError('distance', body?.error?.message || `Routes API answered ${res.status}`, { alert: true, details: 'Driving distance unavailable: coverage is falling back to ZIP codes' });
      return null;
    }
    const meters = body?.routes?.[0]?.distanceMeters;
    // No route (unknown address, overseas): no distance, coverage falls back to the ZIP
    if (typeof meters !== 'number' || meters <= 0) return null;
    miles = Math.round((meters / METERS_PER_MILE) * 10) / 10;
  } catch (err) {
    reportError('distance', err, { details: 'Driving distance lookup failed or timed out: coverage fell back to the ZIP code' });
    return null;
  }

  if (isSupabaseConfigured()) {
    try {
      await createAdminClient().from('distance_cache').upsert({ address_key: key, miles });
    } catch {
      // not cached: the next lookup asks Google again
    }
  }
  return miles;
}

/**
 * Where an address is served. A ZIP on a Zone 1-4 list needs no lookup; anything else is
 * placed by its driving distance (Zone 5 bands, or the waitlist beyond them).
 */
export async function resolveAddressCoverage(address: AddressInput, coverage: Coverage): Promise<CoverageResolution> {
  if (isListedMetroZip(address.zip, coverage)) return resolveCoverage({ zip: address.zip }, coverage);
  const resolution = resolveCoverage({ zip: address.zip }, coverage);
  if (resolution.status === 'incomplete') return resolution;
  const miles = await drivingMilesFromHub(address);
  return resolveCoverage({ zip: address.zip, miles }, coverage);
}
