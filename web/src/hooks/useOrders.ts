'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Order } from '@/types';

export interface CustomerOrdersResponse {
  orders: Order[];
  total_count: number;
  page?: number;
  limit?: number;
  total_pages?: number;
}

// 1. Fetch customer orders with server-side pagination & global caching
export function useCustomerOrders(options?: { page?: number; limit?: number }) {
  const page = options?.page ?? 1;
  const limit = options?.limit ?? 20;

  return useQuery<CustomerOrdersResponse>({
    queryKey: ['orders', { page, limit }],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch (e) {
        console.warn('Could not get session token for customer orders:', e);
      }

      const res = await fetch(`/api/orders?page=${page}&limit=${limit}`, { headers });
      if (!res.ok) throw new Error('Failed to load orders');
      return res.json();
    },
    staleTime: 5 * 1000,
    refetchInterval: 8 * 1000, // 8s polling for customer dashboard updates
    refetchOnWindowFocus: true,
  });
}

// 2. Fetch single order detail with real-time 10s polling
export function useOrderDetail(orderId: string) {
  return useQuery<{ order: Order }>({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          headers['Authorization'] = `Bearer ${data.session.access_token}`;
        }
      } catch (e) {
        console.warn('Could not get session token for order detail:', e);
      }

      const res = await fetch(`/api/orders/${orderId}`, { headers });
      if (!res.ok) throw new Error('Failed to load order details');
      return res.json();
    },
    enabled: Boolean(orderId),
    staleTime: 5 * 1000,
    refetchInterval: 10 * 1000, // 10s polling for live tracker updates
    refetchOnWindowFocus: true,
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

// 4. Cancel a booked order before driver dispatch
export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel order');
      return data;
    },
    onSuccess: (_, orderId) => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
