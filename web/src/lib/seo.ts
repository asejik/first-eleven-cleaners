/**
 * Canonical public address of the site (P08 SEO-01).
 * Vercel serves www and 308-redirects the bare domain to it, so canonicals,
 * Open Graph URLs and structured data must all name www. This is fixed, not
 * read from env, so preview and local builds never emit their own host as canonical.
 */
export const SITE_URL = 'https://www.firstelevencleaners.com';
