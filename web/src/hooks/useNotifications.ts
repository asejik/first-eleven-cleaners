'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    staleTime: 5 * 1000,
    refetchInterval: 5 * 1000, // 5s fast poll for live ops simulator feed
  });
}

export function useDispatchNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      order_id: string;
      stage: OrderStatusKey;
      channel?: 'sms' | 'whatsapp';
      photo_url?: string;
    }) => {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch notification');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
