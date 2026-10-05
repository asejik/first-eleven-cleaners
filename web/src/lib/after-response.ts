import { after } from 'next/server';

/**
 * Runs side work (customer notifications) after the HTTP response is sent (P03 PR-17).
 *
 * Staff actions no longer wait on Twilio/Resend, and on serverless the work is kept alive
 * until it finishes (a bare un-awaited promise can be cut off once the response is sent).
 * Outside a request (scripts, unit tests) `after` throws, so the task just runs now.
 * Errors are logged, never thrown at the caller.
 */
export function runAfterResponse(task: () => Promise<unknown>, label: string): void {
  const safeTask = async () => {
    try {
      await task();
    } catch (err) {
      console.error(`[after-response] ${label} failed:`, err);
    }
  };
  try {
    after(safeTask);
  } catch {
    void safeTask();
  }
}
