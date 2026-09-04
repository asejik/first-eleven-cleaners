import { describe, it, expect } from 'vitest';
import { ROUTES, LEGAL_CONFIG } from '@/lib/constants';

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
});
