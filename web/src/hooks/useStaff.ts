'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { StaffMember, CreateStaffPayload, UpdateStaffPayload } from '@/types';

export function useStaffList() {
  return useQuery<{ staff: StaffMember[] }>({
    queryKey: ['staff', 'roster'],
    queryFn: async () => {
      const res = await fetch('/api/staff');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to fetch staff roster');
      }
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 45 * 1000,
  });
}

export function useCreateStaff() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; staff: StaffMember; temporary_password?: string; message: string }, Error, CreateStaffPayload>({
    mutationFn: async (payload) => {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create staff member');
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', 'roster'] });
    },
  });
}

export function useUpdateStaff() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; staff: StaffMember; message: string }, Error, { id: string; updates: UpdateStaffPayload }>({
    mutationFn: async ({ id, updates }) => {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to update staff member');
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', 'roster'] });
    },
  });
}

export function useDeleteStaff() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message: string }, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/staff/${id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to remove staff member');
      }
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff', 'roster'] });
    },
  });
}
