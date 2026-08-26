import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CommercialAccount,
  CommercialInvoice,
  RecurringSchedule,
} from '@/lib/commercial/types';

export interface CommercialPortalResponse {
  accounts: CommercialAccount[];
  activeAccount: CommercialAccount;
  stats: {
    total_monthly_lbs: number;
    active_hampers: number;
    on_time_sla_rate: string;
    next_pickup: string;
    current_cycle_spend: number;
  };
}

export function useCommercialAccount(accountId?: string) {
  return useQuery<CommercialPortalResponse>({
    queryKey: ['commercial_account', accountId || 'default'],
    queryFn: async () => {
      const url = accountId
        ? `/api/portal?account_id=${encodeURIComponent(accountId)}`
        : '/api/portal';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load commercial account');
      return res.json();
    },
    staleTime: 60 * 1000,
  });
}

export function useCommercialInvoices(accountId?: string) {
  return useQuery<{ invoices: CommercialInvoice[] }>({
    queryKey: ['commercial_invoices', accountId || 'all'],
    queryFn: async () => {
      const url = accountId
        ? `/api/portal/invoices?account_id=${encodeURIComponent(accountId)}`
        : '/api/portal/invoices';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to load invoices');
      return res.json();
    },
    staleTime: 60 * 1000,
  });
}

export function useUpdateCommercialSchedule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { account_id: string; schedule: RecurringSchedule }) => {
      const res = await fetch('/api/portal', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update schedule');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercial_account'] });
    },
  });
}

export function usePayCommercialInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { invoice_id: string }) => {
      const res = await fetch('/api/portal/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: payload.invoice_id, action: 'pay_invoice' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to settle invoice');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commercial_invoices'] });
    },
  });
}
