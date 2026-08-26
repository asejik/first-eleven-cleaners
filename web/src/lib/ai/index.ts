import { ELEVEN_SYSTEM_PROMPT } from './systemPrompt';
import type {
  AIConversationMessage,
  AIResponse,
  ConciergeContext,
  ConciergeIntent,
  IAIEngineProvider,
} from './types';

export * from './types';
export * from './systemPrompt';

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
          content: `Entiendo perfectamente tu inquietud y lamento el inconveniente, ${name}. He notificado a nuestra Directora de Planta (Lydia Painting) y he abierto un reporte prioritario bajo nuestra Garantía 100% "Make It Right". Puedes ingresar los detalles de tu prenda aquí mismo.`,
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
        content: `I completely understand and sincerely apologize for the friction, ${name}. I have flagged this directly for our Plant Director (Lydia Painting) and logged a priority ticket under our 100% Make It Right Guarantee. You can submit photos or details directly through our resolution portal.`,
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
          const lbs = Math.max(15, parseInt(lbsMatch[1], 10));
          const cost = lbs * 3.0;
          estTotal += cost;
          parts.push(`${lbs} lbs Wash & Fold ($${cost.toFixed(2)})`);
        }
        if (suitMatch) {
          const qty = parseInt(suitMatch[1], 10);
          const cost = qty * 19.95;
          estTotal += cost;
          parts.push(`${qty} Suits ($${cost.toFixed(2)})`);
        }
        if (shirtMatch) {
          const qty = parseInt(shirtMatch[1], 10);
          const cost = qty * 8.95;
          estTotal += cost;
          parts.push(`${qty} Dress Shirts ($${cost.toFixed(2)})`);
        }

        calcNote = `\n\n💡 **Instant Estimate for your items:**\n${parts.join(' + ')} = **$${estTotal.toFixed(2)} total** *(includes free pickup & delivery)*.`;
      }

      if (isSpanish) {
        return {
          content: `Nuestros precios son 100% transparentes sin cargos ocultos:\n\n• **Lavandería Wash & Fold:** $3.00/lb (mínimo publicado de 15 lbs / $45.00)\n• **Traje de 2 piezas:** $19.95\n• **Camisas de vestir:** $8.95\n• **Vestidos:** $14.00\n• **Pantalones / Slacks:** $8.95\n• **Edredones / Blancos:** $35.00${calcNote}`,
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
        content: `Our published rates are transparent with no hidden delivery fees:\n\n• **Wash & Fold Laundry:** $3.00/lb (15-lb published minimum / $45.00)\n• **2-Piece Suit:** $19.95\n• **Business Dress Shirt:** $8.95\n• **Dress / Gown:** $14.00\n• **Pants / Slacks:** $8.95\n• **Comforter / Bedding:** $35.00${calcNote}`,
        intent: 'pricing_inquiry',
        detectedLanguage: 'en',
        action: {
          type: 'show_prices',
          label: '📋 View Full Rate Card',
          url: '/pricing',
        },
      };
    }

    // 6. Coverage / Area Inquiries
    if (/\b(area|zone|dfw|dallas|plano|frisco|southlake|coverage|cobertura|ubicacion|donde operan)\b/i.test(raw)) {
      return {
        content: isSpanish
          ? 'Ofrecemos servicio en todo el Metroplex de Dallas–Fort Worth, incluyendo Dallas (Uptown, Downtown, Highland Park), Plano, Frisco, Southlake, McKinney, Allen y Addison con recolección y entrega a domicilio gratis.'
          : 'We service the entire Dallas–Fort Worth Metroplex, including Dallas (Highland Park, University Park, Uptown, Downtown), Plano, Frisco, Southlake, McKinney, Allen, and Addison with free doorstep pickup & delivery.',
        intent: 'coverage_inquiry',
        detectedLanguage: isSpanish ? 'es' : 'en',
        action: {
          type: 'navigate',
          label: '🗺️ Check Service Zones',
          url: '/pricing',
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
      const messages = [
        ...history.map((h) => ({
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
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 600,
          system: ELEVEN_SYSTEM_PROMPT,
          messages,
        }),
      });

      if (!res.ok) {
        throw new Error(`Anthropic API error: ${res.statusText}`);
      }

      const data = await res.json();
      const content = data.content?.[0]?.text || 'I am ready to assist with your garments.';

      const isEscalation = /escalat|claim|support ticket|manager/i.test(content);

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
