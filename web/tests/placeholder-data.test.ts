import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORT_PHONE, LEGAL_CONFIG } from '@/lib/constants';
import { buildStageNotificationEmailHtml, buildWelcomeEmailHtml } from '@/lib/resend';
import { generatePostDeliveryReviewPrompt } from '@/lib/growth';

// ---------------------------------------------------------------------------
// PR-22: customers never see placeholder phone numbers or made-up staff names.
// ---------------------------------------------------------------------------
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}
const SRC = join(__dirname, '..', 'src');

describe('Real contact details in customer messages (PR-22)', () => {
  it('emails show the real support number', () => {
    const stage = buildStageNotificationEmailHtml({
      stageTitle: 'Picked Up',
      customerName: 'Pat',
      orderNumber: 'F11-1',
      messageBody: 'We have your clothes',
      trackingUrl: 'https://x/track/1',
    });
    const welcome = buildWelcomeEmailHtml({ name: 'Pat', loginUrl: 'https://x/login' } as Parameters<typeof buildWelcomeEmailHtml>[0]);
    for (const html of [stage, welcome]) {
      expect(html).toContain(SUPPORT_PHONE);
      expect(html).not.toContain('555-0111');
    }
  });

  it('no server code falls back to a placeholder phone number', () => {
    const offenders = sourceFiles(join(SRC, 'app', 'api'))
      .concat(sourceFiles(join(SRC, 'lib')))
      .filter((f) => readFileSync(f, 'utf8').includes('+12145550199'));
    expect(offenders).toEqual([]);
  });

  it('review requests do not name a driver who may not have made the delivery', () => {
    const prompt = generatePostDeliveryReviewPrompt('o1', 'F11-1', 'Pat Lee', '+12145550100');
    expect(prompt.messageText).not.toMatch(/Marcus/);
    expect(prompt.messageText).toContain('F11-1');
  });

  it('privacy requests go to the privacy mailbox', () => {
    const route = readFileSync(join(SRC, 'app', 'api', 'customer', 'data-deletion', 'route.ts'), 'utf8');
    expect(route).toContain('LEGAL_CONFIG.privacyEmail');
    expect(LEGAL_CONFIG.privacyEmail).toBe('privacy@firstelevencleaners.com');
  });
});
