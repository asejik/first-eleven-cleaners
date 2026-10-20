import { SUPPORT_EMAIL, SUPPORT_PHONE } from '@/lib/constants';

/**
 * Support contact links (client review 2026-10-20, #14: "visible customer-support information").
 * The header, mobile menu, homepage and footer all use these, so the number is the same everywhere.
 */
export const SUPPORT_PHONE_HREF = `tel:+1${SUPPORT_PHONE.replace(/\D/g, '')}`;
export const SUPPORT_EMAIL_HREF = `mailto:${SUPPORT_EMAIL}`;
