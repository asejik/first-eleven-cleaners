import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyApiAuth } from '@/lib/supabase/auth-helpers';
import { getZone5Messages, saveZone5Messages } from '@/lib/zone5-message-settings';
import { Zone5MessagesSchema, ZONE5_MESSAGE_DEFAULTS } from '@/lib/zone5-messages';
import { recordAdminAction } from '@/lib/audit-log';
import { getClientIp } from '@/lib/rate-limiter';
import { apiError } from '@/lib/api-errors';
import type { Json } from '@/types/database';

/**
 * Mission Control's Zone 5 texts (client 2026-10-08): read and save the six templates.
 * Admin only; every save is in the audit log.
 */
export const dynamic = 'force-dynamic';

const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    return NextResponse.json({ messages: await getZone5Messages(), defaults: ZONE5_MESSAGE_DEFAULTS });
  } catch (err: unknown) {
    return apiError('api/mission-control/zone5-messages', err, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await verifyApiAuth(['admin'], request);
    if (auth.errorResponse) return auth.errorResponse;
    const messages = Zone5MessagesSchema.parse(await request.json());
    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: 'Messages can only be saved with the database connected.' }, { status: 503 });
    }
    const before = await getZone5Messages();
    await saveZone5Messages(messages, auth.customer?.email || 'admin');
    await recordAdminAction(createAdminClient(), {
      actor: auth.customer,
      action: 'zone5_messages.update',
      targetType: 'settings',
      targetId: 'zone5_messages',
      details: { before: before as unknown as Json, after: messages as unknown as Json },
      ip: getClientIp(request),
    });
    return NextResponse.json({ success: true, messages });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message || 'Please check the messages.' }, { status: 400 });
    }
    return apiError('api/mission-control/zone5-messages', err, 500);
  }
}
