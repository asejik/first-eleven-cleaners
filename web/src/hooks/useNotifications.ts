'use client';

import { useQuery } from '@tanstack/react-query';
import type { OrderStatusKey } from '@/lib/constants';

export interface NotificationItem {
  id: string;
  order_id?: string;
  customer_name?: string;
  customer_phone?: string;
  channel: 'sms' | 'whatsapp';
  stage: OrderStatusKey;
  text: string;
  media_url: string | null;
  mode: string;
  created_at: string;
}

export function useNotifications(orderId?: string) {
  return useQuery<{ notifications: NotificationItem[] }>({
    queryKey: ['notifications', orderId || 'all'],
    queryFn: async () => {
      const url = orderId ? `/api/notifications?order_id=${encodeURIComponent(orderId)}` : '/api/notifications';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load notifications');
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchInterval: 15 * 1000, // 15s poll (egress-protected)
    refetchIntervalInBackground: false,
  });
}
