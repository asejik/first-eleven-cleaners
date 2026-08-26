export interface ReviewPromptPayload {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  googleReviewUrl: string;
  messageText: string;
}

export interface ChurnCustomerAlert {
  customerId: string;
  customerName: string;
  customerPhone: string;
  lastOrderDate: string;
  daysInactive: number;
  promoCode: string;
  winbackMessage: string;
}

export interface POSAttachRecommendation {
  id: string;
  title: string;
  subtitle: string;
  garment_type: string;
  suggested_quantity: number;
  unit_price: number;
  savings_badge: string;
}

export const POS_ATTACH_RECOMMENDATIONS: POSAttachRecommendation[] = [
  {
    id: 'rec_suits',
    title: '👔 Executive Match-Ready Suits',
    subtitle: 'Add 2 business suits pressed & hand-finished for your upcoming meetings.',
    garment_type: '2-Piece Suit',
    suggested_quantity: 2,
    unit_price: 19.95,
    savings_badge: 'Free Express Hanger Packaging',
  },
  {
    id: 'rec_shirts',
    title: '✨ Crisp Dress Shirts (Light / Medium Starch)',
    subtitle: 'Add 3 dress shirts hand-collared according to Eleven\'s Memory.',
    garment_type: 'Business Shirt',
    suggested_quantity: 3,
    unit_price: 8.95,
    savings_badge: 'Hand-Inspected Seams',
  },
  {
    id: 'rec_bedding',
    title: '🛏️ Luxury Duvet & Bedding Sanitization',
    subtitle: 'Add 1 comforter or duvet sanitized in eco-friendly allergen wash.',
    garment_type: 'Comforter / Duvet',
    suggested_quantity: 1,
    unit_price: 35.0,
    savings_badge: '100% Hypoallergenic Wash',
  },
];

export function generatePostDeliveryReviewPrompt(
  orderId: string,
  orderNumber: string,
  customerName: string,
  customerPhone: string
): ReviewPromptPayload {
  const firstName = customerName.split(' ')[0] || 'there';
  const googleReviewUrl = 'https://g.page/r/firstelevencleaners/review';
  const messageText = `Hi ${firstName}! Marcus delivered Order #${orderNumber} fresh & match-ready to your porch. How was your experience today? Tap to leave a quick review & help our Dallas fleet: ${googleReviewUrl}`;

  return {
    orderId,
    orderNumber,
    customerName,
    customerPhone,
    googleReviewUrl,
    messageText,
  };
}

export function evaluateChurnWinbackList(
  customers: Array<{
    id: string;
    full_name: string;
    phone: string;
    last_order_at?: string;
  }>
): ChurnCustomerAlert[] {
  const now = new Date().getTime();
  const alerts: ChurnCustomerAlert[] = [];

  customers.forEach((c) => {
    const lastDate = c.last_order_at ? new Date(c.last_order_at).getTime() : now - 25 * 86400000;
    const daysInactive = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));

    if (daysInactive >= 21) {
      const firstName = c.full_name.split(' ')[0] || 'there';
      alerts.push({
        customerId: c.id,
        customerName: c.full_name,
        customerPhone: c.phone,
        lastOrderDate: new Date(lastDate).toISOString().split('T')[0],
        daysInactive,
        promoCode: 'COMEBACK15',
        winbackMessage: `We miss you, ${firstName}! Your match-ready wardrobe is waiting. Take 15% off your next pickup with code COMEBACK15 at http://localhost:3000/book`,
      });
    }
  });

  return alerts;
}
