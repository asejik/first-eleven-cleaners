import { describe, it, expect } from 'vitest';
import { ROUTES, LEGAL_CONFIG } from '@/lib/constants';
import {
  SMS_CONSENT_TRANSACTIONAL_TEXT,
  SMS_CONSENT_PROMOTIONAL_TEXT,
} from '@/components/compliance';

describe('Legal & Compliance Policies Configuration', () => {
  it('registers dedicated privacy policy and terms of service routes', () => {
    expect(ROUTES.privacy).toBe('/privacy');
    expect(ROUTES.terms).toBe('/terms');
  });

  it('defines Texas jurisdiction and legal parameters per business standards', () => {
    expect(LEGAL_CONFIG.governingState).toBe('Texas');
    expect(LEGAL_CONFIG.jurisdiction).toBe('Dallas County, Texas');
    expect(LEGAL_CONFIG.claimsReportingWindowDays).toBe(7);
    expect(LEGAL_CONFIG.maxLiabilityMultiplier).toBe(10);
    expect(LEGAL_CONFIG.contactEmail).toBe('legal@firstelevencleaners.com');
    expect(LEGAL_CONFIG.privacyEmail).toBe('privacy@firstelevencleaners.com');
  });

  describe('Carrier A2P 10DLC SMS Compliance', () => {
    it('matches exact mandated carrier disclosure text for transactional order updates', () => {
      const expectedTransactional =
        'I agree to receive order status updates, service notifications, and delivery alerts from First Eleven Cleaners by SMS. Message frequency varies. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Consent is not a condition of purchase.';
      expect(SMS_CONSENT_TRANSACTIONAL_TEXT).toBe(expectedTransactional);
    });

    it('matches exact mandated carrier disclosure text for promotional messages', () => {
      const expectedPromotional =
        'Also send me occasional offers and promotions from First Eleven Cleaners by SMS. Msg & data rates may apply. Reply STOP to cancel.';
      expect(SMS_CONSENT_PROMOTIONAL_TEXT).toBe(expectedPromotional);
    });

    it('contains essential carrier compliance keywords: STOP, HELP, and non-condition-of-purchase clause', () => {
      expect(SMS_CONSENT_TRANSACTIONAL_TEXT).toContain('Reply STOP to cancel');
      expect(SMS_CONSENT_TRANSACTIONAL_TEXT).toContain('HELP for help');
      expect(SMS_CONSENT_TRANSACTIONAL_TEXT).toContain('Consent is not a condition of purchase');
      expect(SMS_CONSENT_TRANSACTIONAL_TEXT).toContain('Msg & data rates may apply');
      expect(SMS_CONSENT_TRANSACTIONAL_TEXT).toContain('Message frequency varies');

      expect(SMS_CONSENT_PROMOTIONAL_TEXT).toContain('Reply STOP to cancel');
      expect(SMS_CONSENT_PROMOTIONAL_TEXT).toContain('Msg & data rates may apply');
    });

    it('recognizes standard carrier compliance keywords (STOP, START, HELP)', () => {
      const isStopKeyword = (msg: string) => /^(STOP|UNSUBSCRIBE|CANCEL|QUIT|END)$/i.test(msg.trim());
      const isStartKeyword = (msg: string) => /^(START|UNSTOP)$/i.test(msg.trim());
      const isHelpKeyword = (msg: string) => /^(HELP|INFO)$/i.test(msg.trim());

      expect(isStopKeyword('STOP')).toBe(true);
      expect(isStopKeyword('unsubscribe')).toBe(true);
      expect(isStopKeyword('cancel')).toBe(true);
      expect(isStopKeyword('random text')).toBe(false);

      expect(isStartKeyword('START')).toBe(true);
      expect(isStartKeyword('unstop')).toBe(true);
      expect(isStartKeyword('continue')).toBe(false);

      expect(isHelpKeyword('HELP')).toBe(true);
      expect(isHelpKeyword('info')).toBe(true);
      expect(isHelpKeyword('question')).toBe(false);
    });
  });
});

