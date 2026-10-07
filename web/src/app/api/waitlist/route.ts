import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimitAsync, getClientIp } from '@/lib/rate-limiter';
import { personNameSchema } from '@/lib/sanitize';
import { getCoverage } from '@/lib/coverage-settings';
import { resolveAddressCoverage } from '@/lib/distance';
import { apiError } from '@/lib/api-errors';

/**
 * "Not in your area yet" (client 2026-10-07, 8C): addresses beyond the last Extended Reach
 * band join the waitlist instead of booking. The server re-checks the address, so only
 * addresses we can't serve are added. Mission Control lists them.
 */
const WaitlistSchema = z
  .object({
    full_name: personNameSchema.optional(),
    email: z.string().email().max(255).optional().or(z.literal('')),
    phone: z.string().max(30).optional().or(z.literal('')),
    street: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    zip: z.string().min(5).max(10),
    source: z.enum(['booking', 'pricing']).default('booking'),
  })
  .refine((v) => Boolean(v.email || v.phone), { message: 'Please leave an email or phone number so we can tell you when we arrive.' });

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function POST(request: Request) {
  try {
    const rate = await checkRateLimitAsync(`waitlist:${getClientIp(request)}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }
    const entry = WaitlistSchema.parse(await request.json());
    const resolution = await resolveAddressCoverage(entry, await getCoverage());
    if (resolution.status === 'served') {
      return NextResponse.json({ error: 'Good news: we already serve this address. Please book your pickup.' }, { status: 400 });
    }

    if (isSupabaseConfigured()) {
      const { error } = await createAdminClient().from('waitlist').insert({
        full_name: entry.full_name || null,
        email: entry.email ? entry.email.trim().toLowerCase() : null,
        phone: entry.phone || null,
        street: entry.street || null,
        city: entry.city || null,
        zip: entry.zip.trim(),
        miles: resolution.status === 'waitlist' ? resolution.miles : null,
        source: entry.source,
      });
      if (error) throw error;
    }
    return NextResponse.json({ success: true, message: "You're on the list. We'll let you know as soon as we reach your area." });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Please check your details.' }, { status: 400 });
    }
    return apiError('api/waitlist', err, 500);
  }
}
