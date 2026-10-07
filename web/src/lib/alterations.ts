import { DRY_CLEAN_PRICES, type InstructionType } from '@/lib/constants';

/**
 * Alterations (client 2026-10-06, Parts B-D). Every alteration line needs a fit instruction
 * before checkout; which kinds an item accepts is set on its catalog entry:
 * - Hems: a measurement (number + unit), match a garment tagged MATCH, or pinned.
 * - Waist, jacket sides and sleeves: an amount ("take in 1 inch") or pinned.
 * - Buttons (one line, a quantity, one description for the set), zipper, elastic and
 *   general repair: a description. General repair may carry a photo for the quote.
 * Turnaround is 3 to 5 business days; the whole order returns together.
 */
export type FitInstruction =
  | { type: 'measurement'; value: number; unit: 'in' | 'cm' }
  | { type: 'match' }
  | { type: 'pinned' }
  | { type: 'amount'; text: string }
  | { type: 'description'; text: string };

export interface AlterationLine {
  garment_type: string;
  quantity: number;
  instruction: FitInstruction;
  notes?: string;
}

export const ALTERATION_MIN_DAYS = 3;
export const ALTERATION_MAX_DAYS = 5;

/** Said by Eleven and shown on the pricing page (client wording; their dash as a period). */
export const ALTERATIONS_NOT_OFFERED =
  'Fitting-based alterations are coming soon. Right now we handle hems, zippers, buttons, repairs, and pinned adjustments.';

export const MATCH_TEXT = 'Match the length of the garment in the same bag, tagged MATCH.';
export const PINNED_TEXT = 'Garment is pinned; alter to the pins.';

export const INSTRUCTION_LABELS: Record<InstructionType, string> = {
  measurement: 'Measurement',
  match: 'Match a garment',
  pinned: 'Pinned',
  amount: 'Amount',
  description: 'Description',
};

export function isAlteration(garmentType: string): boolean {
  return DRY_CLEAN_PRICES[garmentType]?.category === 'alteration';
}

/** One line of plain text for staff, the ticket and the order notes. */
export function instructionText(instruction: FitInstruction): string {
  switch (instruction.type) {
    case 'measurement':
      return `Measurement: finished length ${instruction.value} ${instruction.unit}`;
    case 'match':
      return `Match: ${MATCH_TEXT}`;
    case 'pinned':
      return `Pinned: ${PINNED_TEXT}`;
    case 'amount':
      return `Amount: ${instruction.text}`;
    case 'description':
      return `Description: ${instruction.text}`;
  }
}

export type LineCheck = { ok: true } | { ok: false; error: string };

/** Server and booking screen share this check for every alteration line. */
export function checkAlterationLine(line: AlterationLine): LineCheck {
  const item = DRY_CLEAN_PRICES[line.garment_type];
  if (!item || item.category !== 'alteration') return { ok: false, error: 'Unknown alteration.' };
  const label = item.label;
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || (!item.setWithQuantity && line.quantity !== 1)) {
    return { ok: false, error: `${label}: one piece per line.` };
  }
  if (line.quantity > 50) return { ok: false, error: `${label}: at most 50 per line.` };
  const allowed = item.instructions || [];
  const instruction = line.instruction;
  if (!instruction || !allowed.includes(instruction.type)) {
    return { ok: false, error: `${label}: choose ${allowed.map((t) => INSTRUCTION_LABELS[t].toLowerCase()).join(' or ')}.` };
  }
  if (instruction.type === 'measurement') {
    if (!(instruction.value > 0 && instruction.value <= 200) || !['in', 'cm'].includes(instruction.unit)) {
      return { ok: false, error: `${label}: enter the finished length as a number, in inches or cm.` };
    }
  }
  if (instruction.type === 'amount' || instruction.type === 'description') {
    const text = (instruction.text || '').trim();
    if (text.length < 3) {
      return {
        ok: false,
        error:
          instruction.type === 'amount'
            ? `${label}: say how much, for example "take in 1 inch".`
            : `${label}: please describe what you need.`,
      };
    }
    if (text.length > 300) return { ok: false, error: `${label}: please keep it under 300 characters.` };
  }
  if ((line.notes || '').length > 300) return { ok: false, error: `${label}: notes must be under 300 characters.` };
  return { ok: true };
}

/**
 * Buttons alone can't be booked: an order needs at least one cleaning item (or laundry) or
 * another alteration.
 */
export function buttonsOnlyError({
  itemKeys,
  hasLaundry,
}: {
  itemKeys: string[];
  hasLaundry: boolean;
}): string | null {
  if (hasLaundry) return null;
  const hasButtons = itemKeys.includes('button');
  const hasOther = itemKeys.some((k) => k !== 'button');
  return hasButtons && !hasOther
    ? 'Button replacement needs at least one cleaning item or another alteration in the same order.'
    : null;
}

/** An alteration line as the booking screen holds it while the customer fills it in. */
export interface AlterationDraft {
  uid: string;
  garment_type: string;
  quantity: number;
  type: InstructionType;
  /** Measurement value as typed */
  value: string;
  unit: 'in' | 'cm';
  /** Amount or description text */
  text: string;
  notes: string;
  /** General repair photo, resized on the phone (data URL) */
  photo?: string;
}

export function newAlterationDraft(garmentType: string): AlterationDraft {
  const item = DRY_CLEAN_PRICES[garmentType];
  return {
    uid: `${garmentType}_${Math.random().toString(36).slice(2, 10)}`,
    garment_type: garmentType,
    quantity: 1,
    type: item?.instructions?.[0] || 'description',
    value: '',
    unit: 'in',
    text: '',
    notes: '',
  };
}

/** The line the booking API receives (and checkAlterationLine checks). */
export function draftToLine(draft: AlterationDraft): AlterationLine & { photo?: string } {
  const instruction: FitInstruction =
    draft.type === 'measurement'
      ? { type: 'measurement', value: Number(draft.value), unit: draft.unit }
      : draft.type === 'match'
        ? { type: 'match' }
        : draft.type === 'pinned'
          ? { type: 'pinned' }
          : { type: draft.type, text: draft.text.trim() };
  return {
    garment_type: draft.garment_type,
    quantity: draft.quantity,
    instruction,
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    ...(draft.photo ? { photo: draft.photo } : {}),
  };
}
