/**
 * The Match-Ready Check (client 2026-10-14): the 11-point check as a real gate.
 * - Items 1-5: intake, when the bag comes in. Items 6-10: intake, when the order comes back
 *   from the plant (the 'match_ready_check' stage). Item 11: the driver, at the door.
 * - Photos: anything found in pockets (item 2) and stains (item 3), when there are any; the
 *   return photo (item 10); the delivery photo (item 11). All go on the Garment Passport.
 * - An order leaves the check for Out for Delivery only once items 1-10 are ticked and the
 *   return photo is attached, or with the owner's override (a reason, logged).
 * - Orders weighed before the check existed are exempt from items 1-5.
 * Client-safe; the database side is lib/match-ready-store.ts.
 */

export type MatchReadyPhase = 'intake' | 'return' | 'door';
export type MatchReadyPhotoType = 'pocket_item' | 'stain' | 'return' | 'delivery_proof';

export interface MatchReadyItem {
  item: number;
  label: string;
  phase: MatchReadyPhase;
  /** The photo this item needs: always, or only when something was found */
  photo?: { type: MatchReadyPhotoType; when: 'always' | 'if_found'; ask?: string };
}

/** The client's wording, as he wrote it for the checklist. */
export const MATCH_READY_ITEMS: readonly MatchReadyItem[] = [
  { item: 1, label: 'Order matches the booking (name, items, count)', phase: 'intake' },
  { item: 2, label: 'Pockets checked, anything found photographed and bagged', phase: 'intake', photo: { type: 'pocket_item', when: 'if_found', ask: 'Anything found in pockets?' } },
  { item: 3, label: 'Stains logged with photo', phase: 'intake', photo: { type: 'stain', when: 'if_found', ask: 'Any stains?' } },
  { item: 4, label: 'Care labels and special instructions recorded', phase: 'intake' },
  { item: 5, label: 'Sorted by color, fabric and temperature', phase: 'intake' },
  { item: 6, label: 'Correct process confirmed (wash, dry clean, wet clean, press)', phase: 'return' },
  { item: 7, label: 'Drying and finish checked against the care label', phase: 'return' },
  { item: 8, label: 'Fold or hanger presentation to standard', phase: 'return' },
  { item: 9, label: 'Count reconciled against intake', phase: 'return' },
  { item: 10, label: 'Final appearance inspected, return photo taken', phase: 'return', photo: { type: 'return', when: 'always' } },
  { item: 11, label: 'Sealed in the First Eleven bag, delivery photo taken', phase: 'door', photo: { type: 'delivery_proof', when: 'always' } },
];

export const MATCH_READY_STAGE = 'match_ready_check';
/** Notes on items 2 and 3: whether something was found (and so photographed) */
export const FOUND_NOTE = 'found';
export const NONE_FOUND_NOTE = 'none found';

/** Stages where intake may tick items 1-5 (the bag is in and not yet out for delivery). */
const INTAKE_ITEM_STAGES = ['picked_up', 'weighed_itemized', 'in_cleaning', MATCH_READY_STAGE];

export interface MatchReadyCheckRow {
  item: number;
  note?: string | null;
  done_by?: string | null;
  done_at?: string | null;
}

export interface MatchReadySummary {
  done: number[];
  /** Items 1-10 still to tick before the order can go out (1-5 skipped when exempt) */
  missing: number[];
  returnPhoto: boolean;
  /** Items 1-10 ticked and the return photo attached */
  ready: boolean;
  /** Item 11 ticked at the door too: all 11 points */
  passed: boolean;
  exempt: boolean;
}

export function summarizeMatchReady(
  checks: readonly MatchReadyCheckRow[],
  photos: ReadonlyArray<{ photo_type?: string | null }>,
  { exempt = false }: { exempt?: boolean } = {}
): MatchReadySummary {
  const done = [...new Set(checks.map((c) => c.item))].sort((a, b) => a - b);
  const required = MATCH_READY_ITEMS.filter((i) => i.phase !== 'door' && !(exempt && i.phase === 'intake')).map((i) => i.item);
  const missing = required.filter((n) => !done.includes(n));
  const returnPhoto = photos.some((p) => p.photo_type === 'return');
  const ready = missing.length === 0 && returnPhoto;
  return { done, missing, returnPhoto, ready, passed: ready && done.includes(11), exempt };
}

export type GateCheck = { ok: true; override: boolean } | { ok: false; error: string; missing: number[]; returnPhoto: boolean };

/** May the order leave the check for Out for Delivery? Ready, or the owner overrode it. */
export function checkMatchReadyGate(summary: MatchReadySummary, overrideReason: string | null | undefined): GateCheck {
  if (summary.ready) return { ok: true, override: false };
  if (overrideReason && overrideReason.trim()) return { ok: true, override: true };
  const parts: string[] = [];
  if (summary.missing.length) parts.push(`item${summary.missing.length > 1 ? 's' : ''} ${summary.missing.join(', ')} not ticked`);
  if (!summary.returnPhoto) parts.push('no return photo');
  return {
    ok: false,
    error: `The Match-Ready Check isn't finished (${parts.join('; ')}). Finish it at the Intake Station, or the owner can override it with a reason.`,
    missing: summary.missing,
    returnPhoto: summary.returnPhoto,
  };
}

export type TickCheck = { ok: true } | { ok: false; error: string };

/** Whether this item may be ticked (or unticked) now. Item 11 is ticked by the driver's delivery. */
export function checkTickAllowed(
  item: number,
  orderStatus: string,
  { found, photos }: { found?: boolean; photos: ReadonlyArray<{ photo_type?: string | null }> }
): TickCheck {
  const def = MATCH_READY_ITEMS.find((i) => i.item === item);
  if (!def) return { ok: false, error: 'Unknown check item.' };
  if (def.phase === 'door') return { ok: false, error: 'Item 11 is done by the driver at the door, with the delivery photo.' };
  if (def.phase === 'intake' && !INTAKE_ITEM_STAGES.includes(orderStatus)) {
    return { ok: false, error: 'Items 1 to 5 are done while the order is with us, before it goes out for delivery.' };
  }
  if (def.phase === 'return' && orderStatus !== MATCH_READY_STAGE) {
    return { ok: false, error: 'Items 6 to 10 are done when the order is back from the plant (the Match-Ready Check stage).' };
  }
  const photo = def.photo;
  if (photo && (photo.when === 'always' || found)) {
    if (!photos.some((p) => p.photo_type === photo.type)) {
      const what = photo.type === 'pocket_item' ? 'what was found in the pockets' : photo.type === 'stain' ? 'the stain' : 'the return';
      return { ok: false, error: `Add a photo of ${what} first.` };
    }
  }
  if (photo?.when === 'if_found' && found === undefined) {
    return { ok: false, error: `${photo.ask} Answer yes or no.` };
  }
  return { ok: true };
}

/** What each photo is, on the Garment Passport. */
export const PHOTO_LABELS: Record<string, string> = {
  pickup_proof: 'Pickup',
  intake: 'Intake Check',
  pocket_item: 'Found in Pockets',
  stain: 'Stain at Intake',
  return: 'Return Photo',
  delivery_proof: 'Delivery Proof',
  customer_reference: 'Your Photo',
  no_show_proof: 'Pickup Spot',
};

export function photoLabel(photoType: string | null | undefined): string {
  return PHOTO_LABELS[photoType || ''] || 'Photo';
}
