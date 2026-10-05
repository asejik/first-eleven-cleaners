import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/resend';
import { checkRateLimitAsync } from '@/lib/rate-limiter';
import { runAfterResponse } from '@/lib/after-response';
import { escapeHtml } from '@/lib/sanitize';
import { SUPPORT_EMAIL } from '@/lib/constants';

/**
 * Built-in production error tracking (P03 PR-16).
 *
 * - Every reported error is saved to the `error_logs` table (Supabase → Table Editor), with
 *   email addresses and phone numbers removed.
 * - Serious failures (`alert: true`, and every 5xx from apiError) also email an admin
 *   (ADMIN_ALERT_EMAIL, else the support mailbox), at most once per 10 minutes per source.
 * - Runs after the response and never throws.
 */
const ALERT_WINDOW_MS = 10 * 60 * 1000;

function scrubPersonalData(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]');
}

function describe(err: unknown): { type: string; message: string; stack: string | null } {
  if (err instanceof Error) {
    return { type: err.name || 'Error', message: err.message, stack: err.stack || null };
  }
  if (err && typeof err === 'object') {
    const e = err as { code?: string; message?: string; details?: string };
    return { type: e.code ? `DatabaseError ${e.code}` : 'Object', message: [e.message, e.details].filter(Boolean).join(' | ') || JSON.stringify(err), stack: null };
  }
  return { type: 'Message', message: String(err), stack: null };
}

export function reportError(source: string, err: unknown, opts: { alert?: boolean; details?: string } = {}): void {
  const { type, message, stack } = describe(err);
  const cleanMessage = scrubPersonalData([message, opts.details].filter(Boolean).join(' | ')).slice(0, 2000);
  const cleanStack = stack ? scrubPersonalData(stack).slice(0, 4000) : null;

  runAfterResponse(async () => {
    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');
    if (isSupabaseConfigured) {
      const { error } = await createAdminClient().from('error_logs').insert({
        error_type: type.slice(0, 100),
        message: cleanMessage,
        route: source.slice(0, 255),
        stack_trace: cleanStack,
      });
      if (error) console.error('[error-reporting] could not save error log:', error);
    }

    if (opts.alert) {
      const throttle = await checkRateLimitAsync(`error_alert:${source}`, 1, ALERT_WINDOW_MS);
      if (!throttle.allowed) return;
      await sendEmail({
        to: process.env.ADMIN_ALERT_EMAIL || SUPPORT_EMAIL,
        subject: `⚠️ First Eleven app alert: ${source}`,
        html: `<p><strong>${escapeHtml(source)}</strong> reported a problem at ${new Date().toISOString()}:</p>
<pre style="white-space:pre-wrap">${escapeHtml(cleanMessage)}</pre>
<p>Details are in Supabase → Table Editor → error_logs. Further alerts from this source are paused for 10 minutes.</p>`,
      });
    }
  }, `report ${source}`);
}
