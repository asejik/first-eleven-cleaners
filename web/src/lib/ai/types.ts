import type { CustomerPreferences, Order, Address } from '@/types';

export interface AIConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  action?: AIAction;
}

export interface AIAction {
  type:
    | 'booking_created'
    | 'show_prices'
    | 'show_preferences'
    | 'human_escalated'
    | 'track_order'
    | 'navigate';
  label: string;
  url?: string;
  payload?: Record<string, unknown>;
}

export type ConciergeIntent =
  | 'book_usual'
  | 'check_status'
  | 'pricing_inquiry'
  | 'preferences_inquiry'
  | 'coverage_inquiry'
  | 'human_escalation'
  | 'greeting'
  | 'general_faq';

export interface AIResponse {
  content: string;
  intent: ConciergeIntent;
  action?: AIAction;
  escalateToHuman?: boolean;
  detectedLanguage?: 'en' | 'es';
}

export interface ConciergeContext {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerPreferences?: CustomerPreferences | null;
  recentOrders?: Order[];
  defaultAddress?: Address | null;
}

export interface IAIEngineProvider {
  name: string;
  generateResponse(
    message: string,
    history: AIConversationMessage[],
    context?: ConciergeContext
  ): Promise<AIResponse>;
}
