import type { createAdminClient } from '@/lib/supabase/admin';
import { texasDate } from '@/lib/texas-time';
import { getAppBaseUrl } from '@/lib/constants';
import { earliestExtendedReachRun, nextExtendedReachRun, type Coverage } from '@/lib/coverage';
import { sendContactMessage, type ContactResult } from '@/lib/messaging/contact';
import { reportError } from '@/lib/error-reporting';
import { getZone5Messages } from '@/lib/zone5-message-settings';
import { fillZone5Template, shortRunDate, templateCity, templateFirstName } from '@/lib/zone5-messages';

/**
 * The waitlist texts (client 2026-10-08): "Thanks, you're on the waitlist" when someone joins,
 * and "Extended Reach now serves [City]" to everyone waiting for Zone 5, once, when Mission
 * Control sets the first run date. Texts go to people who ticked "text me"; others get email.
 */
type AdminClient = ReturnType<typeof createAdminClient>;

interface WaitlistContact {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  sms_consent?: boolean | null;
}

export async function sendWaitlistJoined(entry: WaitlistContact): Promise<ContactResult> {
  const messages = await getZone5Messages();
  return sendContactMessage({
    phone: entry.phone,
    email: entry.email,
    smsConsent: Boolean(entry.sms_consent),
    title: "You're on the First Eleven waitlist",
    body: fillZone5Template(messages.waitlistJoined, {
      'First name': templateFirstName(entry.full_name),
      City: templateCity(entry.city),
      link: `${getAppBaseUrl()}/book`,
    }),
  });
}

/**
 * Tells everyone waiting for Zone 5 that it's open, once each (waitlist.notified_at). Called
 * when Mission Control saves a first run date; does nothing while it's blank.
 */
export async function announceZone5Open(supabase: AdminClient, coverage: Coverage, now: Date = new Date()): Promise<{ told: number }> {
  const reach = coverage.extendedReach;
  const firstRun = earliestExtendedReachRun(texasDate(now), reach);
  if (!reach.firstRunDate || !firstRun) return { told: 0 };

  const { data: waiting } = await supabase
    .from('waitlist')
    .select('id, full_name, email, phone, city, sms_consent')
    .eq('reason', 'zone5_not_started')
    .is('notified_at', null)
    .order('created_at')
    .limit(500);

  const messages = await getZone5Messages();
  let told = 0;
  for (const entry of waiting || []) {
    // Claim first, so two saves in a row don't message anyone twice
    const { data: claimed } = await supabase
      .from('waitlist')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', entry.id)
      .is('notified_at', null)
      .select('id');
    if (!claimed || claimed.length === 0) continue;
    const result = await sendContactMessage({
      phone: entry.phone,
      email: entry.email,
      smsConsent: entry.sms_consent,
      title: 'Extended Reach now serves your area',
      body: fillZone5Template(messages.zone5Open, {
        'First name': templateFirstName(entry.full_name),
        City: templateCity(entry.city),
        date: shortRunDate(firstRun),
        'date+7': shortRunDate(nextExtendedReachRun(firstRun, reach)),
        link: `${getAppBaseUrl()}/book`,
      }),
    });
    if (result.ok) told += 1;
    else reportError('zone5-waitlist/open', result.error, { details: `Waitlist ${entry.id}: "Zone 5 now open" not sent` });
  }
  return { told };
}
