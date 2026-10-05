import { NextResponse } from 'next/server';
import { reportError } from '@/lib/error-reporting';

/**
 * Logs the real error server-side and returns a generic message to the client (SEC-19).
 * Raw database/runtime error text can reveal table names, constraints or internals.
 */
export function apiError(context: string, err: unknown, status = 500): NextResponse {
  console.error(`[${context}]`, err);
  // Server failures are recorded in error_logs and alert an admin (PR-16)
  if (status >= 500) reportError(context, err, { alert: true });
  const message =
    status >= 500
      ? 'Something went wrong on our side. Please try again.'
      : 'Invalid request. Please check your details and try again.';
  return NextResponse.json({ error: message }, { status });
}
