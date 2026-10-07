import { describe, it, expect } from 'vitest';
import { catalogItems, DRY_CLEAN_PRICES, isExpressExcluded, catalogLineTotal } from '@/lib/constants';
import { checkAlterationLine, buttonsOnlyError, instructionText, ALTERATIONS_NOT_OFFERED } from '@/lib/alterations';
import { ELEVEN_SYSTEM_PROMPT } from '@/lib/ai/systemPrompt';
import { buildLlmsTxt } from '@/lib/llms';

// ---------------------------------------------------------------------------
// Client 2026-10-06, Parts B-D: the Alterations category, the fit instruction
// each piece needs, buttons as one line with a quantity, and no buttons-only
// orders.
// ---------------------------------------------------------------------------
describe('Alterations catalog', () => {
  it('has the fixed-price and quote-tier items at the client prices', () => {
    const prices = Object.fromEntries(catalogItems('alteration').map(([k, v]) => [k, [v.price, Boolean(v.fromPrice)]]));
    expect(prices).toEqual({
      hem_plain: [29.99, false],
      hem_cuff: [34.99, false],
      hem_jeans: [39.99, false],
      zipper: [35.99, false],
      elastic: [35.99, false],
      button: [5.99, false],
      general_repair: [27.99, true],
      waist: [39.99, true],
      sleeve: [49.99, true],
      sides: [44.99, true],
    });
  });

  it('accepts the instruction kinds the client listed per item', () => {
    for (const k of ['hem_plain', 'hem_cuff', 'hem_jeans']) expect(DRY_CLEAN_PRICES[k].instructions).toEqual(['measurement', 'match', 'pinned']);
    for (const k of ['waist', 'sleeve', 'sides']) expect(DRY_CLEAN_PRICES[k].instructions).toEqual(['amount', 'pinned']);
    for (const k of ['zipper', 'elastic', 'button', 'general_repair']) expect(DRY_CLEAN_PRICES[k].instructions).toEqual(['description']);
    expect(DRY_CLEAN_PRICES.button.setWithQuantity).toBe(true);
    expect(DRY_CLEAN_PRICES.general_repair.photoAllowed).toBe(true);
  });

  it('every alteration is excluded from Express', () => {
    for (const [k] of catalogItems('alteration')) expect(isExpressExcluded(k), k).toBe(true);
  });

  it('buttons are priced per button', () => {
    expect(catalogLineTotal('button', 4)).toBe(23.96);
  });
});

describe('Fit instructions', () => {
  it.each([
    [{ garment_type: 'hem_plain', quantity: 1, instruction: { type: 'measurement', value: 31, unit: 'in' } }],
    [{ garment_type: 'hem_jeans', quantity: 1, instruction: { type: 'match' } }],
    [{ garment_type: 'hem_cuff', quantity: 1, instruction: { type: 'pinned' } }],
    [{ garment_type: 'sleeve', quantity: 1, instruction: { type: 'amount', text: 'shorten 1 inch' } }],
    [{ garment_type: 'button', quantity: 4, instruction: { type: 'description', text: 'Front buttons, match existing' } }],
    [{ garment_type: 'general_repair', quantity: 1, instruction: { type: 'description', text: 'Torn pocket lining' } }],
  ] as const)('accepts %o', (line) => {
    expect(checkAlterationLine(line as Parameters<typeof checkAlterationLine>[0])).toEqual({ ok: true });
  });

  it.each([
    [{ garment_type: 'hem_plain', quantity: 1, instruction: { type: 'amount', text: '1 inch' } }, /measurement or match a garment or pinned/],
    [{ garment_type: 'waist', quantity: 1, instruction: { type: 'measurement', value: 30, unit: 'in' } }, /amount or pinned/],
    [{ garment_type: 'hem_plain', quantity: 1, instruction: { type: 'measurement', value: 0, unit: 'in' } }, /finished length/],
    [{ garment_type: 'sides', quantity: 1, instruction: { type: 'amount', text: '' } }, /take in 1 inch/],
    [{ garment_type: 'zipper', quantity: 1, instruction: { type: 'description', text: 'x' } }, /describe/],
    [{ garment_type: 'hem_plain', quantity: 2, instruction: { type: 'pinned' } }, /one piece per line/],
    [{ garment_type: 'jacket', quantity: 1, instruction: { type: 'pinned' } }, /Unknown alteration/],
  ] as const)('refuses %o', (line, message) => {
    const res = checkAlterationLine(line as unknown as Parameters<typeof checkAlterationLine>[0]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(message);
  });

  it('writes instructions as plain text for staff', () => {
    expect(instructionText({ type: 'measurement', value: 31, unit: 'in' })).toBe('Measurement: finished length 31 in');
    expect(instructionText({ type: 'match' })).toContain('tagged MATCH');
    expect(instructionText({ type: 'pinned' })).toContain('alter to the pins');
  });
});

describe('Buttons alone cannot be booked', () => {
  it('blocks an order of only buttons', () => {
    expect(buttonsOnlyError({ itemKeys: ['button'], hasLaundry: false })).toMatch(/cleaning item or another alteration/);
  });
  it('allows buttons with a cleaning item, laundry or another alteration', () => {
    expect(buttonsOnlyError({ itemKeys: ['button', 'shirt_blouse'], hasLaundry: false })).toBeNull();
    expect(buttonsOnlyError({ itemKeys: ['button', 'hem_plain'], hasLaundry: false })).toBeNull();
    expect(buttonsOnlyError({ itemKeys: ['button'], hasLaundry: true })).toBeNull();
  });
});

describe('Eleven and llms.txt know the alterations', () => {
  it('Eleven has the list, instruction types, quote band, turnaround and the not-offered sentence', () => {
    expect(ELEVEN_SYSTEM_PROMPT).toContain('Pants hem (plain): $29.99');
    expect(ELEVEN_SYSTEM_PROMPT).toContain('Jacket sleeve shorten: from $49.99');
    expect(ELEVEN_SYSTEM_PROMPT).toContain('tagged MATCH');
    expect(ELEVEN_SYSTEM_PROMPT).toContain('Up to 25% above the listed from-price is charged automatically');
    expect(ELEVEN_SYSTEM_PROMPT).toContain('3-5 business days');
    expect(ELEVEN_SYSTEM_PROMPT).toContain(ALTERATIONS_NOT_OFFERED);
  });
  it('llms.txt lists them', () => {
    expect(buildLlmsTxt()).toContain('### Alterations (per item)');
  });
});
