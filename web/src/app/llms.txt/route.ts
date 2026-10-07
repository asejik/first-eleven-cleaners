import { buildLlmsTxt } from '@/lib/llms';
import { getCoverage } from '@/lib/coverage-settings';

// Built from constants.ts (P08 SEO-02) and the live coverage settings (client 2026-10-07),
// refreshed every 5 minutes after a Mission Control change.
export const revalidate = 300;

export async function GET() {
  return new Response(buildLlmsTxt(await getCoverage()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
