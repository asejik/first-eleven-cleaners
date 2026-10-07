import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { reportError } from '@/lib/error-reporting';
import type { Json } from '@/types/database';
import { buildCoverage, mergeCoverageSettings, DEFAULT_COVERAGE_SETTINGS, type Coverage, type CoverageSettings } from '@/lib/coverage';

/**
 * Coverage settings edited in Mission Control (client 2026-10-07, request 8), stored as one
 * app_settings row (key 'coverage') over the defaults in constants.ts. Server only.
 * Read through a short in-memory cache, so a booking doesn't query settings every time; a
 * save clears it on this server, other servers pick it up within a minute.
 */
const SETTINGS_KEY = 'coverage';
const CACHE_MS = 60_000;
let cache: { at: number; settings: CoverageSettings } | null = null;

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function getCoverageSettings(): Promise<CoverageSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.settings;
  let settings = DEFAULT_COVERAGE_SETTINGS;
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await createAdminClient().from('app_settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
      if (error) throw error;
      settings = mergeCoverageSettings(data?.value);
    } catch (err) {
      // Bookings keep working on the defaults; an admin is told
      reportError('coverage-settings', err, { details: 'Could not read the coverage settings; using the defaults' });
    }
  }
  cache = { at: Date.now(), settings };
  return settings;
}

export async function getCoverage(): Promise<Coverage> {
  return buildCoverage(await getCoverageSettings());
}

/** Clears the cache (after a save, and in tests). */
export function resetCoverageCache(): void {
  cache = null;
}

const day = z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
const money = z.number().min(0).max(10_000);
const miles = z.number().min(0).max(500);
const zoneSchema = z.object({
  minimumOrder: money,
  routeDays: z.array(day).min(1).max(6),
  expressEligible: z.boolean(),
  minMiles: miles,
  maxMiles: miles,
});

export const CoverageSettingsSchema = z
  .object({
    expressEnabled: z.boolean(),
    zones: z.object({ zone_1: zoneSchema, zone_2: zoneSchema, zone_3: zoneSchema, zone_4: zoneSchema }),
    extendedReach: z.object({
      minimumOrder: money,
      routineDiscountPercent: z.number().min(0).max(100),
      waitlistBeyondMiles: miles,
      cadenceWeeks: z.number().int().min(1).max(8),
      routeDay: day,
      firstRunDate: z.iso.date(),
      bookingNoticeDays: z.number().int().min(3).max(14),
      bands: z
        .array(
          z.object({
            id: z.enum(['A', 'B']),
            minMiles: miles,
            maxMiles: miles,
            fee: money,
            dispatchThreshold: z.number().int().min(1).max(50),
          })
        )
        .length(2),
    }),
  })
  .superRefine((s, ctx) => {
    for (const [id, zone] of Object.entries(s.zones)) {
      if (zone.minMiles > zone.maxMiles) ctx.addIssue({ code: 'custom', path: ['zones', id], message: `${id}: the band's lower miles must be below its upper miles.` });
    }
    const [a, b] = s.extendedReach.bands;
    if (a.id !== 'A' || b.id !== 'B') ctx.addIssue({ code: 'custom', path: ['extendedReach', 'bands'], message: 'Bands must be A then B.' });
    if (!(a.minMiles < a.maxMiles && a.maxMiles <= b.minMiles && b.minMiles < b.maxMiles)) {
      ctx.addIssue({ code: 'custom', path: ['extendedReach', 'bands'], message: 'Band A must end where Band B starts (or before), each going up.' });
    }
    if (b.maxMiles > s.extendedReach.waitlistBeyondMiles) {
      ctx.addIssue({ code: 'custom', path: ['extendedReach', 'waitlistBeyondMiles'], message: 'The waitlist must start at or beyond the end of Band B.' });
    }
    const dow = new Date(`${s.extendedReach.firstRunDate}T12:00:00Z`).getUTCDay();
    const routeDow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(s.extendedReach.routeDay);
    if (dow !== routeDow) {
      ctx.addIssue({ code: 'custom', path: ['extendedReach', 'firstRunDate'], message: `The first run date must be a ${s.extendedReach.routeDay}.` });
    }
  });

export async function saveCoverageSettings(settings: CoverageSettings, updatedBy: string): Promise<void> {
  const { error } = await createAdminClient()
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: settings as unknown as Json, updated_at: new Date().toISOString(), updated_by: updatedBy });
  if (error) throw error;
  cache = { at: Date.now(), settings };
}
