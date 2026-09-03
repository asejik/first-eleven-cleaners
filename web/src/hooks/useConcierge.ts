import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AIConversationMessage, AIResponse } from '@/lib/ai/types';

const STORAGE_KEY = 'f11_eleven_chat_history_v1';

const INITIAL_GREETING: AIConversationMessage = {
  role: 'assistant',
  content:
    'Hello! I am **Eleven**, your Match-Ready AI Concierge. I have access to your saved preferences, active orders, and DFW route schedules. How can I assist your wardrobe today?',
  timestamp: new Date().toISOString(),
};

function getInitialMessages(): AIConversationMessage[] {
  if (typeof window === 'undefined') return [INITIAL_GREETING];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {}
  return [INITIAL_GREETING];
}

export function useConcierge() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<AIConversationMessage[]>(getInitialMessages);

  // Save to localStorage whenever messages change
  useEffect(() => {
    if (typeof window !== 'undefined' && messages.length > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      } catch (e) {
        console.warn('Could not save chat history:', e);
      }
    }
  }, [messages]);

  const mutation = useMutation({
    mutationFn: async (payload: { message: string; history: AIConversationMessage[]; customerId?: string }) => {
      const res = await fetch('/api/concierge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: payload.message,
          history: payload.history,
          customer_id: payload.customerId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to communicate with Eleven AI Concierge.');
      }

      return res.json() as Promise<{
        success: boolean;
        response: AIResponse;
        createdOrder?: unknown;
        engine: string;
      }>;
    },
  });

  const sendMessage = useCallback(
    async (text: string, customerId?: string) => {
      if (!text.trim() || mutation.isPending) return;

      const userMsg: AIConversationMessage = {
        role: 'user',
        content: text.trim(),
        timestamp: new Date().toISOString(),
      };

      const updatedHistory = [...messages, userMsg];
      setMessages(updatedHistory);

      try {
        const result = await mutation.mutateAsync({
          message: text.trim(),
          history: updatedHistory,
          customerId,
        });

        if (result.createdOrder || result.response?.action?.type === 'track_order') {
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['activeOrders'] });
          queryClient.invalidateQueries({ queryKey: ['order'] });
        }

        const assistantMsg: AIConversationMessage = {
          role: 'assistant',
          content: result.response.content,
          timestamp: new Date().toISOString(),
          action: result.response.action,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: unknown) {
        const errorMsg: AIConversationMessage = {
          role: 'assistant',
          content: `I ran into a temporary hiccup connecting to plant operations: ${(err as Error).message}. Our team has been notified.`,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    },
    [messages, mutation, queryClient]
  );

  const resetChat = useCallback(() => {
    const fresh = [INITIAL_GREETING];
    setMessages(fresh);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    } catch {
      // ignore
    }
  }, []);

  return {
    messages,
    sendMessage,
    resetChat,
    isLoading: mutation.isPending,
  };
}
