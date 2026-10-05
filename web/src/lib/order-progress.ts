import { ORDER_STATUSES } from '@/lib/constants';

/**
 * The six stages an order moves through, for progress timelines. "Cancelled" is an
 * outcome, not a step, so it is never drawn as one (P05 AR-04).
 */
export const PROGRESS_STAGES = ORDER_STATUSES.filter((s) => s.key !== 'cancelled');

/** Position of the order on the timeline; -1 for a cancelled (or unknown) status. */
export function progressIndex(status: string): number {
  return PROGRESS_STAGES.findIndex((s) => s.key === status);
}
