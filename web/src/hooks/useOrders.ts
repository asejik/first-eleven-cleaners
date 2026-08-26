'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Order } from '@/types';

// 1. Fetch all customer orders
export function useCustomerOrders() {
  return useQuery<{ orders: Order[]; total_count: number }>({
    queryKey: ['orders'],
    queryFn: async () => {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error('Failed to load orders');
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
}

// 2. Fetch single order detail with real-time 30s polling
export function useOrderDetail(orderId: string) {
  return useQuery<{ order: Order }>({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error('Failed to load order details');
      return res.json();
    },
    enabled: Boolean(orderId),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000, // 30s polling for live tracker updates
  });
}

// 3. Submit a "Make It Right" claim
export function useSubmitClaim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      order_id: string;
      issue_type: string;
      description: string;
      photo_urls?: string[];
    }) => {
      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit claim');
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['order', variables.order_id] });
      queryClient.invalidateQueries({ queryKey: ['claims'] });
      queryClient.invalidateQueries({ queryKey: ['claims', variables.order_id] });
    },
  });
}
