import { buildLlmsTxt } from '@/lib/llms';

// Built once at build time from constants.ts (P08 SEO-02).
export const dynamic = 'force-static';

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
