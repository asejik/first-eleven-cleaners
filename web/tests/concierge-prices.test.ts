import { describe, it, expect } from 'vitest';
import { DRY_CLEAN_PRICES, WASH_FOLD_PRICE_PER_LB, WASH_FOLD_MINIMUM_PRICE, ZONE_CONFIG } from '@/lib/constants';
import { ELEVEN_SYSTEM_PROMPT } from '@/lib/ai/systemPrompt';
import { SimulatedAIEngineProvider } from '@/lib/ai';

// ---------------------------------------------------------------------------
// PR-21: the concierge quotes exactly the prices the booking page charges.
// ---------------------------------------------------------------------------
const money = (n: number) => `$${n.toFixed(2)}`;
const RETIRED_PRICES = ['$19.95', '$8.95', '$14.00', '$18.50', '$35.00'];

describe('Concierge prices match the booking catalog (PR-21)', () => {
  it('the AI prompt lists every catalog item at its catalog price', () => {
    for (const { label, price } of Object.values(DRY_CLEAN_PRICES)) {
      expect(ELEVEN_SYSTEM_PROMPT).toContain(`${label}: ${money(price)}`);
    }
    expect(ELEVEN_SYSTEM_PROMPT).toContain(`${money(WASH_FOLD_PRICE_PER_LB)} per lb`);
    expect(ELEVEN_SYSTEM_PROMPT).toContain(money(WASH_FOLD_MINIMUM_PRICE));
    for (const zone of Object.values(ZONE_CONFIG)) {
      expect(ELEVEN_SYSTEM_PROMPT).toContain(money(zone.minimumOrder));
    }
    for (const old of RETIRED_PRICES) expect(ELEVEN_SYSTEM_PROMPT).not.toContain(old);
  });

  it('the built-in assistant quotes catalog prices in English and Spanish', async () => {
    const engine = new SimulatedAIEngineProvider();
    for (const question of ['How much does dry cleaning cost?', '¿Cuál es el precio de la tintorería?']) {
      const { content } = await engine.generateResponse(question, []);
      expect(content).toContain(money(DRY_CLEAN_PRICES.shirt_blouse.price));
      expect(content).toContain(money(DRY_CLEAN_PRICES.dress.price));
      for (const old of RETIRED_PRICES) expect(content).not.toContain(old);
    }
  });

  it('instant estimates use catalog prices', async () => {
    const { content } = await new SimulatedAIEngineProvider().generateResponse('price for 2 suits and 3 shirts', []);
    const suit = DRY_CLEAN_PRICES.jacket.price + DRY_CLEAN_PRICES.pants_skirt.price;
    expect(content).toContain(money(2 * suit));
    expect(content).toContain(money(3 * DRY_CLEAN_PRICES.laundered_shirt.price));
  });
});
