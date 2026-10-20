/**
 * Google Analytics 4 (client 2026-10-20). The measurement ID is set in Vercel as
 * NEXT_PUBLIC_GA_MEASUREMENT_ID (Production only), so local and preview builds send nothing.
 * The tag loads only after the visitor picks "Accept All Cookies", and never on staff pages.
 */
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,20}$/;

/** The measurement ID when it is set and well formed, else null */
export function gaMeasurementId(raw = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID): string | null {
  const id = raw?.trim().toUpperCase();
  return id && MEASUREMENT_ID.test(id) ? id : null;
}

/** Only an explicit "Accept All Cookies" allows analytics */
export const analyticsAllowed = (consent: string) => consent === 'all';
