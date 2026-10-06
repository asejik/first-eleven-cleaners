import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DRY_CLEAN_PRICES, catalogItems, catalogPriceLabel } from '@/lib/constants';
import { ELEVEN_SYSTEM_PROMPT } from '@/lib/ai/systemPrompt';
import { SimulatedAIEngineProvider } from '@/lib/ai';
import { chatPriceList } from '@/lib/ai/price-list';

// ---------------------------------------------------------------------------
// Client 2026-10-06: Eleven knows the full new rate card (with the Household
// category), the Mon-Fri plant schedule, the Saturday-pickup rule, and that we
// don't clean leather or suede. The Terms no longer list leather or suede.
// ---------------------------------------------------------------------------
const engine = new SimulatedAIEngineProvider();
const ask = async (q: string) => (await engine.generateResponse(q, [])).content;

describe("Eleven's rate card (Claude prompt)", () => {
  it('lists the Household category with every household price', () => {
    expect(ELEVEN_SYSTEM_PROMPT).toContain('Household Items (per item)');
    for (const [, item] of catalogItems('household')) {
      expect(ELEVEN_SYSTEM_PROMPT).toContain(`${item.label}: ${catalogPriceLabel(item)}`);
    }
    expect(ELEVEN_SYSTEM_PROMPT).toContain('$64.99 per dozen');
  });

  it('states the plant schedule, the Saturday rule and Express days', () => {
    expect(ELEVEN_SYSTEM_PROMPT).toContain('Our plant runs Monday to Friday');
    expect(ELEVEN_SYSTEM_PROMPT).toContain('Saturday pickups are delivered Tuesday');
    expect(ELEVEN_SYSTEM_PROMPT).toContain('Monday-Thursday morning pickups');
    expect(ELEVEN_SYSTEM_PROMPT).not.toMatch(/Monday-Friday morning pickups/);
  });

  it("says we don't clean leather or suede", () => {
    expect(ELEVEN_SYSTEM_PROMPT).toContain("We don't clean leather or suede.");
  });
});

describe("Eleven's built-in answers (no Claude key)", () => {
  it('the price list has Dry Cleaning and Household sections', () => {
    const list = chatPriceList('en');
    expect(list).toContain('**Household (per item)**');
    expect(list).toContain(`Comforter (king): ${catalogPriceLabel(DRY_CLEAN_PRICES.comforter_king)}`);
    expect(list).toContain('Wedding Dress: from $149.99');
    expect(chatPriceList('es')).toContain('Artículos del Hogar');
  });

  it('answers leather and suede questions in English and Spanish', async () => {
    expect(await ask('Do you clean leather jackets?')).toContain("We don't clean leather or suede.");
    expect(await ask('How much for a suede coat?')).toContain("We don't clean leather or suede.");
    expect(await ask('¿Limpian cuero? hola')).toContain('no limpiamos cuero ni gamuza');
  });

  it('answers Saturday and operating-day questions', async () => {
    const answer = await ask('If you pick up on Saturday, when do I get it back?');
    expect(answer).toContain('Saturday pickups are delivered Tuesday');
    expect(answer).toContain('Monday to Friday');
    expect(await ask('What days do you operate?')).toContain('24-Hour Express pickups run Monday to Thursday');
  });
});

describe('Terms page', () => {
  it('no longer lists leather or suede as accepted at owner risk', () => {
    const terms = readFileSync(join(__dirname, '..', 'src', 'app', 'terms', 'page.tsx'), 'utf8');
    expect(terms).toContain('Items accepted at owner risk include: natural furs');
    expect(terms).not.toMatch(/leather|suede/i);
  });
});
