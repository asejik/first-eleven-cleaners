import type { OrderStatusKey } from '@/lib/constants';

export interface MessagePayload {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  stage: OrderStatusKey;
  pickupDate?: string;
  pickupWindow?: 'morning' | 'evening';
  deliveryDate?: string;
  deliveryWindow?: 'morning' | 'evening' | null;
  weightLbs?: number | null;
  itemCount?: number;
  total?: number;
  photoUrl?: string;
  trackingUrl: string;
}

export interface FormattedMessage {
  stage: OrderStatusKey;
  title: string;
  smsBody: string;
  whatsappBody: string;
  mediaUrl?: string;
}

export function formatStageMessage(data: MessagePayload): FormattedMessage {
  const firstName = data.customerName.split(' ')[0] || 'Valued Customer';
  const orderNum = data.orderNumber || data.orderId.slice(0, 8);
  const pDate = data.pickupDate || 'Scheduled date';
  const pWindow = data.pickupWindow === 'morning' ? 'Morning (7:30–10:00 AM)' : 'Evening (5:00–8:00 PM)';
  const dDate = data.deliveryDate || 'Within 48 hours';
  const dWindow = data.deliveryWindow === 'morning' ? 'Morning (7:30–10:00 AM)' : 'Evening (5:00–8:00 PM)';

  switch (data.stage) {
    case 'booked':
      return {
        stage: 'booked',
        title: '📋 Order Confirmation',
        smsBody: `⚽ First Eleven Cleaners: Hi ${firstName}, Order #${orderNum} is confirmed! Pickup is scheduled for ${pDate} during our ${pWindow} window. Place your laundry bag on your front porch or with concierge. Track live: ${data.trackingUrl}`,
        whatsappBody: `⚽ *FIRST ELEVEN CLEANERS*\n\nHi ${firstName}! Your order *#${orderNum}* is booked & confirmed.\n\n📅 *Pickup:* ${pDate}\n⏱️ *Window:* ${pWindow}\n\n📍 Please place your laundry bag at your designated drop spot.\n\n📲 *Live Tracker:* ${data.trackingUrl}`,
        mediaUrl: data.photoUrl,
      };

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
        smsBody: `⚖️ First Eleven: Order #${orderNum} has been inspected and itemized (${summaryText}). Final total: ${totalFormatted}. View your Garment Passport photo intake receipt: ${data.trackingUrl}`,
        whatsappBody: `⚖️ *GARMENT PASSPORT & INTAKE TICKET*\n\nOrder *#${orderNum}* has been verified by our plant team:\n\n🧺 *Breakdown:* ${summaryText}\n💰 *Total:* ${totalFormatted}\n\n📸 *View High-Res Intake Photos & Receipt:*\n${data.trackingUrl}`,
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
        smsBody: `✅ First Eleven Cleaners: Delivered! Order #${orderNum} is fresh, pressed, and waiting at your delivery spot. View delivery proof photo: ${data.trackingUrl}. Thank you for choosing First Eleven!`,
        whatsappBody: `✅ *DELIVERED & MATCH-READY*\n\nOrder *#${orderNum}* has been safely delivered to your designated spot.\n\n🛡️ *Backed by our 100% Make It Right Guarantee.*\n\n📸 *View Delivery Proof Photo:*\n${data.trackingUrl}`,
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
