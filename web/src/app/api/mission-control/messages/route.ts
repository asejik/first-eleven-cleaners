import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { checkMessageText, textFor, testedMessage, OWN_TEXT_DEFAULTS, OWN_TEXT_KEYS, TESTED_MESSAGES, type TestedMessageKey } from '@/lib/message-tests';
import { getMessageTests, messageTestStats, saveMessageTests } from '@/lib/message-tests-store';
import { getZone5Messages } from '@/lib/zone5-message-settings';
import type { Zone5MessageKey } from '@/lib/zone5-messages';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';
import type { Json } from '@/types/database';

/**
 * Mission Control > Messaging (client 2026-10-14): the A/B message tests. GET lists each
 * testable message with its version A and B, whether B is on, and sends, taps and bookings
 * per version. POST saves a message's versions, or starts a fresh count. Admin only.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

const KeySchema = z.string().refine((k) => Boolean(testedMessage(k)), 'Unknown message.');
const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), key: KeySchema, a: z.string().max(480).optional(), b: z.string().max(480), bOn: z.boolean() }),
  z.object({ action: z.literal('restart'), key: KeySchema }),
]);

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const [tests, zone5] = await Promise.all([getMessageTests(), getZone5Messages()]);
    const stats = isSupabaseConfigured() ? await messageTestStats(createAdminClient(), tests) : {};
    return NextResponse.json({
      messages: TESTED_MESSAGES.map((info) => {
        const test = tests[info.key];
        return {
          ...info,
          a: textFor(info.key, 'A', test, info.zone5 ? zone5[info.key as Zone5MessageKey] : undefined),
          b: test?.b ?? '',
          bOn: Boolean(test?.bOn),
          countFrom: test?.countFrom ?? null,
          stats: stats[info.key] ?? { A: { sent: 0, tapped: 0, booked: 0 }, B: { sent: 0, tapped: 0, booked: 0 } },
        };
      }),
    });
  } catch (err: unknown) {
    return apiError('api/mission-control/messages', err, 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const parsed = BodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Please check the details.' }, { status: 400 });
    if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Needs the database connected.' }, { status: 503 });
    const body = parsed.data;
    const key = body.key as TestedMessageKey;
    const tests = { ...(await getMessageTests()) };
    const before = tests[key] ?? { b: '', bOn: false, countFrom: null };
    const by = auth.customer?.email || 'admin';

    if (body.action === 'restart') {
      tests[key] = { ...before, countFrom: new Date().toISOString() };
    } else {
      const isOwnText = (OWN_TEXT_KEYS as readonly string[]).includes(key);
      const a = isOwnText ? body.a?.trim() || OWN_TEXT_DEFAULTS[key as keyof typeof OWN_TEXT_DEFAULTS] : undefined;
      if (a !== undefined) {
        const problem = checkMessageText(key, a);
        if (problem) return NextResponse.json({ error: `Version A: ${problem}` }, { status: 400 });
      }
      const b = body.b.trim();
      if (body.bOn || b) {
        const problem = checkMessageText(key, b);
        if (problem) return NextResponse.json({ error: `Version B: ${problem}` }, { status: 400 });
      }
      // A changed text starts a fresh count, so the numbers always describe the current versions
      const changed = (isOwnText && a !== (before.a ?? OWN_TEXT_DEFAULTS[key as keyof typeof OWN_TEXT_DEFAULTS])) || b !== before.b || body.bOn !== before.bOn;
      tests[key] = {
        ...(isOwnText ? { a } : {}),
        b,
        bOn: body.bOn && b.length > 0,
        countFrom: changed ? new Date().toISOString() : before.countFrom,
      };
    }
    await saveMessageTests(tests, by);
    await recordAdminAction(createAdminClient(), {
      actor: auth.customer,
      action: body.action === 'restart' ? 'message_test.restart' : 'message_test.save',
      targetType: 'settings',
      targetId: `message_tests.${key}`,
      details: { before: before as unknown as Json, after: tests[key] as unknown as Json },
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    return apiError('api/mission-control/messages', err, 500);
  }
}
