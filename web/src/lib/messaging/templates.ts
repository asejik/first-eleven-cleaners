import type { OrderStatusKey } from '@/lib/constants';
import { greetingFirstName } from '@/lib/sanitize';
import { isSaturdayPickup, SATURDAY_PICKUP_NOTICE } from '@/lib/schedule';

export interface MessagePayload {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  stage: OrderStatusKey;
  pickupDate?: string;
  pickupWindow?: string; // 'morning' | 'evening' (varchar column)
  deliveryDate?: string | null;
  deliveryWindow?: string | null;
  weightLbs?: number | null;
  itemCount?: number;
  total?: number;
  photoUrl?: string;
  trackingUrl: string;
  customMessage?: string;
  /** Title (email subject) for a custom message; defaults to the Express guarantee title */
  customTitle?: string;
  smsConsent?: boolean;
  /** Guest bookings only: account invitation link for the confirmation email (P05 AR-14) */
  signupUrl?: string;
}

export interface FormattedMessage {
  stage: OrderStatusKey;
  title: string;
  smsBody: string;
  whatsappBody: string;
  mediaUrl?: string;
}

/** The booking page on the same site as a tracking link (the Delivered message's "next pickup" tap). */
function bookUrl(trackingUrl: string): string {
  return trackingUrl.replace(/\/track\/.*$/, '/book');
}

export function formatStageMessage(data: MessagePayload): FormattedMessage {
  if (data.customMessage) {
    return {
      stage: data.stage,
      title: data.customTitle || '⚡ 24-Hour Express SLA Guarantee',
      smsBody: data.customMessage,
      whatsappBody: data.customMessage,
      mediaUrl: data.photoUrl,
    };
  }

  // Letters only: a customer-supplied name can never carry a link into an SMS (SEC-09)
  const firstName = greetingFirstName(data.customerName);
  const orderNum = data.orderNumber || data.orderId.slice(0, 8);
  const pDate = data.pickupDate || 'Scheduled date';
  const pWindow = data.pickupWindow === 'morning' ? 'Morning (7:30–10:00 AM)' : 'Evening (5:00–8:00 PM)';
  const dDate = data.deliveryDate || 'Within 48 hours';
  const dWindow = data.deliveryWindow === 'morning' ? 'Morning (7:30–10:00 AM)' : 'Evening (5:00–8:00 PM)';

  switch (data.stage) {
    case 'booked': {
      // Client 2026-10-06: the plant runs Mon-Fri, so Saturday pickups say when they come back
      const saturday = data.pickupDate && isSaturdayPickup(data.pickupDate) ? ` ${SATURDAY_PICKUP_NOTICE}` : '';
      return {
        stage: 'booked',
        title: '📋 Order Confirmation',
        smsBody: `⚽ First Eleven Cleaners: Hi ${firstName}, Order #${orderNum} is confirmed! Pickup is scheduled for ${pDate} during our ${pWindow} window.${saturday} Place your laundry bag on your front porch or with concierge. Track live: ${data.trackingUrl}`,
        whatsappBody: `⚽ *FIRST ELEVEN CLEANERS*\n\nHi ${firstName}! Your order *#${orderNum}* is booked & confirmed.\n\n📅 *Pickup:* ${pDate}\n⏱️ *Window:* ${pWindow}${saturday ? `\n🚚${saturday}` : ''}\n\n📍 Please place your laundry bag at your designated drop spot.\n\n📲 *Live Tracker:* ${data.trackingUrl}`,
        mediaUrl: data.photoUrl,
      };
    }

    case 'picked_up':
      return {
        stage: 'picked_up',
        title: '🚐 Garments Picked Up',
        smsBody: `🚐 First Eleven: We've got your clothes! Our driver has secured your bag from ${pDate} and is en route to our master cleaning facility. Track live: ${data.trackingUrl}`,
        whatsappBody: `🚐 *GARMENTS SECURED*\n\nHi ${firstName}, our driver has picked up Order *#${orderNum}* and is en route to our cleaning hub.\n\nNext step: Digital weighing & Garment Passport intake check.\n\n📲 *Live Tracker:* ${data.trackingUrl}`,
        mediaUrl: data.photoUrl,
      };

    case 'weighed_itemized': {
      const weightText = data.weightLbs ? `${data.weightLbs} lbs` : '';
      const itemsText = data.itemCount ? `${data.itemCount} dry clean pieces` : '';
      const summaryText = [weightText, itemsText].filter(Boolean).join(' + ') || 'Inspected items';
      const totalFormatted = data.total ? `$${data.total.toFixed(2)}` : 'Calculated';

      return {
        stage: 'weighed_itemized',
        title: '⚖️ Weighed & Itemized Ticket',
        // The receipt goes out the moment we charge, with the ticket, the photos and the two
        // taps: Looks good / Something's off (client 2026-10-06, Part A)
        smsBody: `⚖️ First Eleven: Order #${orderNum} is weighed and itemized (${summaryText}). We've charged ${totalFormatted} to your card. Your itemized ticket and photos: ${data.trackingUrl} Tap "Looks good", or "Something's off" and we'll Make It Right today.`,
        whatsappBody: `⚖️ *ITEMIZED TICKET & RECEIPT*\n\nOrder *#${orderNum}* is weighed and itemized:\n\n🧺 *Breakdown:* ${summaryText}\n💳 *Charged:* ${totalFormatted}\n\n📸 *Your ticket and intake photos:*\n${data.trackingUrl}\n\nTap *Looks good*, or *Something's off* and we'll Make It Right today.`,
        mediaUrl: data.photoUrl,
      };
    }

    case 'in_cleaning':
      return {
        stage: 'in_cleaning',
        title: '✨ In Cleaning Process',
        smsBody: `✨ First Eleven: Order #${orderNum} is now undergoing professional eco-friendly cleaning and hand-pressing. 48-Hour match-ready delivery on schedule for ${dDate} (${dWindow}). Track: ${data.trackingUrl}`,
        whatsappBody: `✨ *CLEANING IN PROGRESS*\n\nYour garments for Order *#${orderNum}* are now in our master plant undergoing eco-friendly cleaning, fiber conditioning, and hand pressing.\n\n🚚 *Target Delivery:* ${dDate} (${dWindow})\n📲 *Track:* ${data.trackingUrl}`,
        mediaUrl: data.photoUrl,
      };

    case 'out_for_delivery':
      return {
        stage: 'out_for_delivery',
        title: '🚚 Out for Delivery',
        smsBody: `🚚 First Eleven: Driver is out for delivery! Your fresh, pressed garments for Order #${orderNum} are on their way and will arrive during your ${dWindow} window. Track driver: ${data.trackingUrl}`,
        whatsappBody: `🚚 *OUT FOR DELIVERY*\n\nHi ${firstName}, our driver is on the road with your fresh, pressed garments for Order *#${orderNum}*!\n\n⏱️ *Expected Window:* ${dWindow}\n📲 *Live Tracker:* ${data.trackingUrl}`,
        mediaUrl: data.photoUrl,
      };

    case 'delivered':
      return {
        stage: 'delivered',
        title: '✅ Delivered & Match-Ready',
        smsBody: `✅ First Eleven Cleaners: Delivered! Order #${orderNum} is fresh, pressed, and waiting at your delivery spot. View delivery proof photo: ${data.trackingUrl}. Book your next pickup: ${bookUrl(data.trackingUrl)}`,
        whatsappBody: `✅ *DELIVERED & MATCH-READY*\n\nOrder *#${orderNum}* has been safely delivered to your designated spot.\n\n🛡️ *Backed by our 100% Make It Right Guarantee.*\n\n📸 *View Delivery Proof Photo:*\n${data.trackingUrl}\n\n🧺 *Book your next pickup:* ${bookUrl(data.trackingUrl)}`,
        mediaUrl: data.photoUrl,
      };

    default:
      return {
        stage: data.stage,
        title: 'ℹ️ Order Update',
        smsBody: `First Eleven Cleaners: Order #${orderNum} status update: ${data.stage}. View details: ${data.trackingUrl}`,
        whatsappBody: `First Eleven Cleaners: Order #${orderNum} update: ${data.stage}.\n${data.trackingUrl}`,
      };
  }
}
