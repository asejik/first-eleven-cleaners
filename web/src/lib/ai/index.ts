import { buildElevenSystemPrompt } from './systemPrompt';
import type {
  AIConversationMessage,
  AIResponse,
  ConciergeContext,
  IAIEngineProvider,
} from './types';
import { chatPriceList, SUIT_PRICE, DRESS_SHIRT_PRICE, NO_LEATHER_LINE, plantScheduleLine, alterationLines } from './price-list';
import { ALTERATIONS_NOT_OFFERED } from '@/lib/alterations';
import { WASH_FOLD_MINIMUM_LBS, WASH_FOLD_PRICE_PER_LB, EXTENDED_REACH_LABEL, extendedReachTurnaroundLine } from '@/lib/constants';
import { DEFAULT_COVERAGE, feeLabel, extendedReachStartLine, type Coverage } from '@/lib/coverage';

export * from './types';
export * from './systemPrompt';

/** The live coverage settings (Mission Control), or the code defaults if they can't be read. */
async function loadCoverage(): Promise<Coverage> {
  try {
    const { getCoverage } = await import('@/lib/coverage-settings');
    return await getCoverage();
  } catch {
    return DEFAULT_COVERAGE;
  }
}

/** The zones answer (client 2026-10-07, request 8): Zones 1-4, Zone 5 and the waitlist. */
export function coverageAnswer(coverage: Coverage = DEFAULT_COVERAGE): string {
  const r = coverage.extendedReach;
  const zones = coverage.zonesList
    .map((z) => `- **${z.name}**: $${z.minimumOrder.toFixed(0)} minimum, free delivery, ${z.routeScheduleLabel}${z.expressEligible ? ', 24-Hr Express Mon-Thu' : ''}. ${z.cities.join(', ')}.`)
    .join('\n');
  const bands = r.bands.map((b) => `${feeLabel(b.fee)} at ${b.minMiles}-${b.maxMiles} mi`).join(', ');
  return [
    'Door-to-door courier delivery is complimentary across the entire DFW Metroplex:',
    zones,
    `- **${coverage.extendedReachZone.name}** (beyond the Metroplex: ${coverage.extendedReachZone.cities.join(', ')}): $${r.minimumOrder.toFixed(0)} minimum plus an ${EXTENDED_REACH_LABEL} fee (${bands}; ${r.routineDiscountPercent}% off for Routine members). ${extendedReachTurnaroundLine(r)}${r.firstRunDate ? '' : ` ${extendedReachStartLine(r)}`}`,
    `Zones 3 and 4 deliver on their next route day (a Zone 4 Friday pickup comes back Tuesday). Beyond ${r.waitlistBeyondMiles} miles we're not there yet, but you can join the waitlist. Enter your address on the booking page to see your exact zone, fee and dates.`,
  ].join('\n');
}

/**
 * Smart Heuristic Simulated AI Engine Provider
 * Operates with 0 external API cost, instant latency, and full memory awareness.
 */
export class SimulatedAIEngineProvider implements IAIEngineProvider {
  name = 'Eleven Heuristic Engine (Simulated)';

  async generateResponse(
    message: string,
    _history: AIConversationMessage[],
    context?: ConciergeContext
  ): Promise<AIResponse> {
    const raw = message.toLowerCase().trim();
    const isSpanish =
      /\b(hola|buenos|dias|tardes|noches|cuanto|cuesta|lavanderia|tintoreria|recoger|ropa|gracias|por favor|horario|precio)\b/i.test(
        raw
      );

    const name = context?.customerName?.split(' ')[0] || 'there';
    const prefs = context?.customerPreferences;
    const recentOrder = context?.recentOrders?.[0];

    // 1. Human Escalation / Damage / Complaints
    if (
      /\b(damage|ruined|torn|stain left|refund|complaint|manager|human|agent|representative|lawyer|speak to someone|call me|queja|dañado|roto|humano)\b/i.test(
        raw
      )
    ) {
      if (isSpanish) {
        return {
          content: `Entiendo perfectamente tu inquietud y lamento el inconveniente, ${name}. He notificado a nuestra Directora de Planta y he abierto un reporte prioritario bajo nuestra Garantía 100% "Make It Right". Puedes ingresar los detalles de tu prenda aquí mismo.`,
          intent: 'human_escalation',
          escalateToHuman: true,
          detectedLanguage: 'es',
          action: {
            type: 'human_escalated',
            label: '🛡️ Abrir Reclamo "Make It Right"',
            url: recentOrder ? `/claim/${recentOrder.id}` : '/claim/support',
          },
        };
      }

      return {
        content: `I completely understand and sincerely apologize for the friction, ${name}. I have flagged this directly for our Plant Director and logged a priority ticket under our 100% Make It Right Guarantee. You can submit photos or details directly through our resolution portal.`,
        intent: 'human_escalation',
        escalateToHuman: true,
        detectedLanguage: 'en',
        action: {
          type: 'human_escalated',
          label: '🛡️ Open Make It Right Claim',
          url: recentOrder ? `/claim/${recentOrder.id}` : '/claim/support',
        },
      };
    }

    // 2. Booking Intent ("Book my usual", "Schedule pickup", "Book for tomorrow")
    if (
      /\b(book|schedule|usual|pickup|repeat order|tomorrow|tuesday|morning|evening|reservar|recogida|agendar)\b/i.test(
        raw
      )
    ) {
      const starchText = prefs?.starch_level ? `${prefs.starch_level} starch` : 'medium starch';
      const foldText = prefs?.fold_vs_hang === 'hang' ? 'on hangers' : 'crisp folded';
      const deterText = prefs?.detergent_sensitivity ? `${prefs.detergent_sensitivity} detergent` : 'hypoallergenic detergent';
      const addressText = context?.defaultAddress ? `${context.defaultAddress.street}` : 'your saved DFW address';

      if (isSpanish) {
        return {
          content: `¡Con gusto, ${name}! He revisado la memoria de Eleven para tu perfil:\n\n• **Servicio:** Lavandería Wash & Fold habitual\n• **Preferencias:** Almidón ${starchText}, ${foldText}, detergente ${deterText}\n• **Dirección:** ${addressText}\n\n¿Deseas programar la recolección para la próxima ventana disponible (Mañana 7:30–10AM o Tarde 5–8PM)?`,
          intent: 'book_usual',
          detectedLanguage: 'es',
          action: {
            type: 'booking_created',
            label: '⚡ Confirmar y Agendar Recolección',
            url: '/book',
          },
        };
      }

      return {
        content: `I'm on it, ${name}! According to Eleven's Memory, here is your match-ready profile:\n\n• **Service:** Your usual Wash & Fold + Dry Cleaning\n• **Preferences:** ${starchText}, ${foldText}, ${deterText}\n• **Pickup Address:** ${addressText}\n\nOur route specialist can collect your bag during the upcoming morning (7:30–10 AM) or evening (5–8 PM) shift.`,
        intent: 'book_usual',
        detectedLanguage: 'en',
        action: {
          type: 'booking_created',
          label: '⚡ Review & Confirm Pickup Slot',
          url: '/book',
        },
      };
    }

    // 3. Track Order / Status Check
    if (/\b(status|track|where is|order|delivery time|rastrear|estado|donde esta|mi pedido)\b/i.test(raw)) {
      if (recentOrder) {
        const orderNum = recentOrder.order_number || recentOrder.id.slice(0, 8);
        const stageLabel = recentOrder.status.replace('_', ' ').toUpperCase();

        if (isSpanish) {
          return {
            content: `Tu pedido **#${orderNum}** se encuentra actualmente en estado: **${stageLabel}**.\n\nFecha estimada de entrega: **${recentOrder.delivery_date} (${recentOrder.delivery_window || 'tarde'})** bajo nuestra Garantía Match-Ready de 48 Horas.`,
            intent: 'check_status',
            detectedLanguage: 'es',
            action: {
              type: 'track_order',
              label: '📍 Ver Rastreo en Vivo',
              url: `/track/${recentOrder.id}`,
            },
          };
        }

        return {
          content: `Your active order **#${orderNum}** is currently: **${stageLabel}**.\n\nTarget delivery is on schedule for **${recentOrder.delivery_date} (${recentOrder.delivery_window || 'evening'})** under our 48-Hour Match-Ready Guarantee.`,
          intent: 'check_status',
          detectedLanguage: 'en',
          action: {
            type: 'track_order',
            label: '📍 Open Live Domino\'s Tracker',
            url: `/track/${recentOrder.id}`,
          },
        };
      }

      return {
        content: isSpanish
          ? 'No encontré pedidos activos en este momento. ¿Te gustaría agendar una nueva recolección?'
          : 'You don\'t have any active orders right now. Would you like to schedule a fresh pickup?',
        intent: 'check_status',
        detectedLanguage: isSpanish ? 'es' : 'en',
        action: {
          type: 'navigate',
          label: '🧺 Schedule a Pickup',
          url: '/book',
        },
      };
    }

    // 4. Eleven's Memory / Preferences Inquiry
    if (/\b(preference|starch|fold|hanger|detergent|memory|perfil|almidon|doblado|detergente|preferencia)\b/i.test(raw)) {
      if (prefs) {
        return {
          content: `Here is what Eleven's Memory has saved for your garments:\n\n• **Starch Level:** ${prefs.starch_level || 'Medium Starch'}\n• **Shirt Packaging:** ${prefs.fold_vs_hang === 'hang' ? 'On Hangers' : 'Crisp Tumble Fold'}\n• **Detergent:** ${prefs.detergent_sensitivity || 'Hypoallergenic Eco-Clean'}\n• **Special Care Note:** ${prefs.special_notes || prefs.delivery_instructions || 'None recorded'}\n\nYou can update these anytime in your preferences portal.`,
          intent: 'preferences_inquiry',
          detectedLanguage: 'en',
          action: {
            type: 'show_preferences',
            label: '⚙️ Manage Eleven\'s Memory',
            url: '/dashboard/preferences',
          },
        };
      }

      return {
        content: 'You can configure your custom starch levels, folding vs hanger presentation, and hypoallergenic detergent in Eleven\'s Memory.',
        intent: 'preferences_inquiry',
        detectedLanguage: 'en',
        action: {
          type: 'show_preferences',
          label: '⚙️ Setup Preferences',
          url: '/dashboard/preferences',
        },
      };
    }

    // 5a. Leather and suede: not cleaned (client 2026-10-06)
    if (/\b(leather|suede|cuero|gamuza)\b/i.test(raw)) {
      return {
        content: isSpanish
          ? 'Lo sentimos: no limpiamos cuero ni gamuza. Con gusto atendemos el resto de sus prendas.'
          : `Sorry: ${NO_LEATHER_LINE} We're happy to take care of the rest of your wardrobe.`,
        intent: 'general_faq',
        detectedLanguage: isSpanish ? 'es' : 'en',
      };
    }

    // 5c. Fitting-based alterations aren't offered yet (client 2026-10-06, exact wording)
    if (/\b(fitting|fittings|take in (a |my |the )?(dress|gown)|gown take-?in|dress take-?in|prueba de ropa)\b/i.test(raw)) {
      return {
        content: isSpanish
          ? 'Los arreglos que requieren prueba en persona llegarán pronto. Por ahora hacemos dobladillos, cierres, botones, reparaciones y ajustes con alfileres.'
          : ALTERATIONS_NOT_OFFERED,
        intent: 'general_faq',
        detectedLanguage: isSpanish ? 'es' : 'en',
      };
    }

    // 5d. Alterations: prices, fit instructions, quotes and turnaround (Parts B-D)
    if (/\b(alteration|alterations|alter|hem|hems|hemming|tailor|tailoring|zipper|button|buttons|mend|mending|sleeve|sleeves|waistband|arreglo|arreglos|dobladillo|cierre)\b/i.test(raw)) {
      const list = alterationLines().map((l) => `• ${l}`).join('\n');
      return {
        content: isSpanish
          ? `Hacemos arreglos en 3 a 5 días hábiles, y su pedido completo regresa junto:\n\n${list}\n\nPara cada prenda indique una medida, una prenda para igualar (marcada MATCH en la misma bolsa) o alfileres. Los precios "from" se confirman con las fotos de recepción; hasta 25% más se cobra automáticamente y más requiere su aprobación. No disponible con Express de 24 horas.`
          : `We do alterations in 3-5 business days, and your whole order comes back together:\n\n${list}\n\nFor each piece, tell us a measurement, a garment to match (tag it MATCH in the same bag), or pin it. "From" prices are confirmed after our intake photos: up to 25% above the listed price is charged automatically, anything higher needs your OK, and if you decline it comes back unaltered at no charge. Alterations aren't available with 24-Hour Express. ${ALTERATIONS_NOT_OFFERED}`,
        intent: 'pricing_inquiry',
        detectedLanguage: isSpanish ? 'es' : 'en',
        action: { type: 'show_prices', label: isSpanish ? '🧵 Ver Precios' : '🧵 View Alteration Prices', url: '/pricing' },
      };
    }

    // 5b. Operating days and delivery days (the plant runs Mon-Fri)
    if (/\b(saturday|sunday|weekend|weekday|what days|which days|turnaround|s[aá]bado|domingo|fin de semana)\b/i.test(raw)) {
      return {
        content: plantScheduleLine(isSpanish ? 'es' : 'en'),
        intent: 'general_faq',
        detectedLanguage: isSpanish ? 'es' : 'en',
      };
    }

    // 5. Pricing Inquiries / Dynamic Calculator
    if (/\b(price|cost|how much|rate|lbs|suit|dress|pricing|precio|costo|tarifa|cuanto vale)\b/i.test(raw)) {
      // Dynamic Regex price calculation e.g. "20 lbs" or "2 suits"
      let calcNote = '';
      const lbsMatch = raw.match(/(\d+)\s*(?:lbs|pounds|libras)/i);
      const suitMatch = raw.match(/(\d+)\s*(?:suits|suit|trajes)/i);
      const shirtMatch = raw.match(/(\d+)\s*(?:shirts|shirt|camisas)/i);

      if (lbsMatch || suitMatch || shirtMatch) {
        let estTotal = 0;
        const parts: string[] = [];

        if (lbsMatch) {
          const lbs = Math.max(WASH_FOLD_MINIMUM_LBS, parseInt(lbsMatch[1], 10));
          const cost = lbs * WASH_FOLD_PRICE_PER_LB;
          estTotal += cost;
          parts.push(`${lbs} lbs Wash & Fold ($${cost.toFixed(2)})`);
        }
        if (suitMatch) {
          const qty = parseInt(suitMatch[1], 10);
          const cost = qty * SUIT_PRICE;
          estTotal += cost;
          parts.push(`${qty} Suits ($${cost.toFixed(2)})`);
        }
        if (shirtMatch) {
          const qty = parseInt(shirtMatch[1], 10);
          const cost = qty * DRESS_SHIRT_PRICE;
          estTotal += cost;
          parts.push(`${qty} Dress Shirts ($${cost.toFixed(2)})`);
        }

        calcNote = `\n\n💡 **Instant Estimate for your items:**\n${parts.join(' + ')} = **$${estTotal.toFixed(2)}** before the environmental fee and tax *(pickup & delivery are free)*.`;
      }

      if (isSpanish) {
        return {
          content: `Nuestros precios son 100% transparentes:\n\n${chatPriceList('es')}${calcNote}`,
          intent: 'pricing_inquiry',
          detectedLanguage: 'es',
          action: {
            type: 'show_prices',
            label: '📋 Ver Menú de Precios Completo',
            url: '/pricing',
          },
        };
      }

      return {
        content: `Our published rates are transparent with no hidden delivery fees:\n\n${chatPriceList('en')}${calcNote}`,
        intent: 'pricing_inquiry',
        detectedLanguage: 'en',
        action: {
          type: 'show_prices',
          label: '📋 View Full Rate Card',
          url: '/pricing',
        },
      };
    }

    // 6. Coverage / Area Inquiries: the five zones, Zone 5 Extended Reach and the waitlist
    if (/\b(area|areas|zone|zones|dfw|dallas|plano|frisco|southlake|coverage|deliver to|extended reach|sherman|weatherford|denton|fort worth|cobertura|ubicacion|donde operan)\b/i.test(raw)) {
      const coverage = await loadCoverage();
      return {
        content: isSpanish
          ? `Ofrecemos recolección y entrega a domicilio gratis en todo el Metroplex de Dallas–Fort Worth (Zonas 1-4, con un pedido mínimo según la zona). Más allá del Metroplex, la Zona 5 (Extended Reach) tiene un mínimo de $${coverage.extendedReach.minimumOrder.toFixed(0)} y un cargo de entrega según la distancia. Ingrese su dirección en la página de reservas para ver su zona exacta.`
          : coverageAnswer(coverage),
        intent: 'coverage_inquiry',
        detectedLanguage: isSpanish ? 'es' : 'en',
        action: {
          type: 'navigate',
          label: '🗺️ Check Service Zones',
          url: '/service-areas',
        },
      };
    }

    // 7. General Greetings & Fallback
    if (isSpanish) {
      return {
        content: `¡Hola ${name}! Soy **Eleven**, tu conserje de cuidado de prendas en First Eleven Cleaners. ¿En qué te puedo ayudar hoy? Puedo agendar tu recolección habitual, rastrear un pedido o cotizar tus prendas.`,
        intent: 'greeting',
        detectedLanguage: 'es',
        action: {
          type: 'navigate',
          label: '🧺 Agendar Recolección',
          url: '/book',
        },
      };
    }

    return {
      content: `Hello ${name}! I'm **Eleven**, your Master Garment Concierge at First Eleven Cleaners. How can I assist you today? I can schedule your usual pickup, track active garments, review your saved preferences, or calculate instant pricing.`,
      intent: 'greeting',
      detectedLanguage: 'en',
      action: {
        type: 'navigate',
        label: '🧺 Schedule a Pickup',
        url: '/book',
      },
    };
  }
}

/**
 * Claude AI Engine Provider (Anthropic API)
 * Automatically activates when ANTHROPIC_API_KEY is configured in .env.local
 */
export class ClaudeAIEngineProvider implements IAIEngineProvider {
  name = 'Claude 3.5 Sonnet (Anthropic)';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateResponse(
    message: string,
    history: AIConversationMessage[],
    context?: ConciergeContext
  ): Promise<AIResponse> {
    try {
      // Keep only recent conversational turns (last 10 messages) to prevent unbounded token expansion (F-01)
      const MAX_HISTORY = 10;
      const recentHistory = history.slice(-MAX_HISTORY);

      const messages = [
        ...recentHistory.map((h) => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: h.content,
        })),
        {
          role: 'user',
          content: `[Customer Context: Name=${context?.customerName || 'Customer'}, Preferences=${JSON.stringify(
            context?.customerPreferences || {}
          )}, RecentOrders=${JSON.stringify(context?.recentOrders || [])}]\n\nUser Query: ${message}`,
        },
      ];

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
          max_tokens: 600,
          // Zones, Zone 5 and the Express switch as Mission Control set them (client 2026-10-07)
          system: buildElevenSystemPrompt(await loadCoverage()),
          messages,
        }),
        signal: AbortSignal.timeout(20_000), // PR-17
      });

      if (!res.ok) {
        throw new Error(`Anthropic API error: ${res.statusText}`);
      }

      const data = await res.json();
      const content = data.content?.[0]?.text || 'I am ready to assist with your garments.';

      const isEscalation = /escalat|claim|support ticket|manager/i.test(content);
      // Booking requests always go through the booking page; the concierge never books (SEC-10)
      const wantsBooking = /\b(book|booking|schedule|pick ?up|agendar|programar|recolecci[oó]n)\b/i.test(message);

      if (wantsBooking && !isEscalation) {
        return {
          content,
          intent: 'book_usual',
          action: { type: 'navigate', label: '🧺 Book a Pickup', url: '/book' },
        };
      }

      return {
        content,
        intent: isEscalation ? 'human_escalation' : 'general_faq',
        escalateToHuman: isEscalation,
      };
    } catch (err) {
      console.warn('Claude API call failed, falling back to simulated engine:', err);
      const fallback = new SimulatedAIEngineProvider();
      return fallback.generateResponse(message, history, context);
    }
  }
}

/**
 * AI Engine Factory
 */
export function getAIEngine(): IAIEngineProvider {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey && anthropicKey.startsWith('sk-ant-')) {
    return new ClaudeAIEngineProvider(anthropicKey);
  }
  return new SimulatedAIEngineProvider();
}
