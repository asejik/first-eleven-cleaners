import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#10): "Ensure the policy describes actual production systems."
// WhatsApp isn't switched on, there is no mobile app and no voice notes; the providers that do
// handle customer data are named.
// ---------------------------------------------------------------------------
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('Privacy Policy and screens describe the systems we run', () => {
  it('no WhatsApp, mobile applications or voice notes', () => {
    const privacy = read('src/app/privacy/page.tsx');
    expect(privacy).not.toMatch(/WhatsApp|mobile application|voice note/i);
  });

  it('names the providers that handle customer data', () => {
    const privacy = read('src/app/privacy/page.tsx');
    for (const provider of ['Square', 'Vercel', 'Supabase', 'Twilio', 'Resend', 'Google Maps Platform', 'Upstash', 'Anthropic']) {
      expect(privacy).toContain(provider);
    }
  });

  it.each(['src/app/dashboard/profile/page.tsx', 'src/components/booking/StepConfirmation.tsx', 'src/app/dashboard/preferences/page.tsx'])(
    '%s does not offer WhatsApp',
    (file) => {
      expect(read(file)).not.toMatch(/WhatsApp/);
    },
  );
});
