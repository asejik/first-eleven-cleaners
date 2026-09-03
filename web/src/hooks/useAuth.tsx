'use client';

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';
import type { Customer, UserRole } from '@/types';
import { createClient } from '@/lib/supabase/client';

interface AuthState {
  user: Customer | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, pass: string) => Promise<{ error?: string; role?: UserRole }>;
  signup: (data: { full_name: string; email: string; phone: string; password?: string }) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
}

const MOCK_STORAGE_KEY = 'f11_mock_user';
const AUTH_CACHE_KEY = 'f11_auth_customer';
const AUTH_CACHE_TIME_KEY = 'f11_auth_timestamp';
const AUTH_TTL_MS = 4 * 60 * 1000; // 4-minute TTL cache

function determineRole(email: string, metaRole?: string, dbRole?: string): UserRole {
  const clean = email.toLowerCase().trim();
  // Exact administrative and staff accounts take precedence
  if (clean === 'admin@firstelevencleaners.com' || clean === 'admin@firsteleven.com') return 'admin';
  if (clean === 'driver@firstelevencleaners.com' || clean === 'driver@firsteleven.com') return 'driver';
  if (clean === 'intake@firstelevencleaners.com' || clean === 'intake@firsteleven.com') return 'intake_staff';

  if (dbRole && ['admin', 'driver', 'intake_staff', 'customer'].includes(dbRole)) {
    return dbRole as UserRole;
  }
  if (metaRole && ['admin', 'driver', 'intake_staff', 'customer'].includes(metaRole)) {
    return metaRole as UserRole;
  }
  return 'customer';
}

function getInitialCustomer(): Customer | null {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(AUTH_CACHE_KEY) || localStorage.getItem(MOCK_STORAGE_KEY);
    if (cached) {
      const parsed: Customer = JSON.parse(cached);
      if (!parsed.role) {
        parsed.role = determineRole(parsed.email);
      }
      return parsed;
    }
  } catch {}
  return null;
}

function hasFreshCachedSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cached = localStorage.getItem(AUTH_CACHE_KEY) || localStorage.getItem(MOCK_STORAGE_KEY);
    const cachedTime = localStorage.getItem(AUTH_CACHE_TIME_KEY);
    if (cached && cachedTime && Date.now() - Number(cachedTime) < AUTH_TTL_MS) {
      return true;
    }
  } catch {}
  return false;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Customer | null>(getInitialCustomer);
  const [isLoading, setIsLoading] = useState<boolean>(() => !hasFreshCachedSession());

  const updateCustomerState = useCallback((newCustomer: Customer | null) => {
    if (newCustomer && !newCustomer.role) {
      newCustomer.role = determineRole(newCustomer.email);
    }
    setUser(newCustomer);
    if (typeof window !== 'undefined') {
      if (newCustomer) {
        localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(newCustomer));
        localStorage.setItem(AUTH_CACHE_TIME_KEY, String(Date.now()));
      } else {
        localStorage.removeItem(AUTH_CACHE_KEY);
        localStorage.removeItem(AUTH_CACHE_TIME_KEY);
        localStorage.removeItem(MOCK_STORAGE_KEY);
        localStorage.removeItem('f11_customer_preferences');
      }
    }
  }, []);

  // Check if live Supabase is configured with real URL
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://your-project.supabase.co' &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  useEffect(() => {
    let isMounted = true;
    const hasFresh = hasFreshCachedSession();

    async function initAuth() {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
          if (!isMounted) return;

          if (authUser && !userError) {
            // Fetch customer record with specific columns to minimize network egress
            const { data } = await supabase
              .from('customers')
              .select('id, auth_id, email, phone, full_name, role, created_at, updated_at')
              .eq('auth_id', authUser.id)
              .maybeSingle();

            if (!isMounted) return;

            const role = determineRole(
              authUser.email || '',
              authUser.user_metadata?.role,
              data?.role
            );

            if (data) {
              const fullCustomer: Customer = {
                ...(data as Customer),
                role,
              };
              updateCustomerState(fullCustomer);
            } else {
              // Fallback user from auth session
              const fallback: Customer = {
                id: authUser.id,
                auth_id: authUser.id,
                email: authUser.email || '',
                phone: authUser.user_metadata?.phone || '',
                full_name: authUser.user_metadata?.full_name || (authUser.email?.split('@')[0] ?? 'Valued Customer'),
                role,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              updateCustomerState(fallback);
            }
          } else {
            updateCustomerState(null);
          }
        } catch {
          if (isMounted) loadLocalUser();
        }
      } else {
        loadLocalUser();
      }
      if (isMounted) {
        setIsLoading(false);
      }
    }

    function loadLocalUser() {
      try {
        const stored = localStorage.getItem(AUTH_CACHE_KEY) || localStorage.getItem(MOCK_STORAGE_KEY);
        if (stored) {
          const parsed: Customer = JSON.parse(stored);
          if (!parsed.role) {
            parsed.role = determineRole(parsed.email);
          }
          updateCustomerState(parsed);
        }
      } catch {
        // Ignore local storage error
      }
    }

    // Only make network call if cache was expired or missing
    if (!hasFresh) {
      initAuth();
    }

    // Subscribe to auth state changes for real-time reactivity without polling
    let authSubscription: { unsubscribe: () => void } | null = null;
    if (isSupabaseConfigured) {
      try {
        const supabase = createClient();
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (!isMounted) return;
          if (event === 'SIGNED_OUT') {
            updateCustomerState(null);
          } else if (session?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'TOKEN_REFRESHED')) {
            // Re-sync session
            initAuth();
          }
        });
        authSubscription = subscription;
      } catch {}
    }

    return () => {
      isMounted = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, [isSupabaseConfigured, updateCustomerState]);

  const login = useCallback(
    async (email: string, pass: string): Promise<{ error?: string; role?: UserRole }> => {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
          if (error) return { error: error.message };

          if (data.user) {
            const { data: customerData } = await supabase
              .from('customers')
              .select('*')
              .eq('auth_id', data.user.id)
              .maybeSingle();

            const role = determineRole(
              data.user.email || email,
              data.user.user_metadata?.role,
              customerData?.role
            );

            if (customerData) {
              const fullCust: Customer = {
                ...(customerData as Customer),
                role,
              };
              updateCustomerState(fullCust);
              return { role };
            } else {
              const fallback: Customer = {
                id: data.user.id,
                auth_id: data.user.id,
                email: data.user.email || email,
                phone: data.user.user_metadata?.phone || '',
                full_name: data.user.user_metadata?.full_name || email.split('@')[0],
                role,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              updateCustomerState(fallback);
              return { role };
            }
          }
        } catch (e: unknown) {
          return { error: (e as Error).message };
        }
      }

      // Mock login for local testing
      const mockRole = determineRole(email);
      const mockCustomer: Customer = {
        id: 'c0000000-0000-0000-0000-000000000001',
        email,
        phone: '(214) 555-0199',
        full_name: email.split('@')[0].replace('.', ' ').toUpperCase() || 'Valued Customer',
        role: mockRole,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      updateCustomerState(mockCustomer);
      return { role: mockRole };
    },
    [isSupabaseConfigured, updateCustomerState]
  );

  const signup = useCallback(
    async (data: { full_name: string; email: string; phone: string; password?: string }): Promise<{ error?: string }> => {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email: data.email,
            password: data.password || 'TemporaryPassword123!',
            options: {
              data: {
                full_name: data.full_name,
                phone: data.phone,
              },
            },
          });
          if (authError) return { error: authError.message };

          if (authData.user) {
            // 1. First check if the Supabase Postgres trigger already created the customer record
            const { data: existingCustomer } = await supabase
              .from('customers')
              .select('*')
              .eq('auth_id', authData.user.id)
              .maybeSingle();

            if (existingCustomer) {
              updateCustomerState(existingCustomer as Customer);
              return {};
            }

            // 2. If trigger didn't create it, safely upsert on email/auth_id
            const { data: upserted, error: upsertError } = await supabase
              .from('customers')
              .upsert(
                {
                  auth_id: authData.user.id,
                  email: data.email,
                  phone: data.phone,
                  full_name: data.full_name,
                },
                { onConflict: 'email' }
              )
              .select()
              .maybeSingle();

            if (!upsertError && upserted) {
              updateCustomerState(upserted as Customer);
              return {};
            }

            // 3. Fallback local representation for active session
            const fallback: Customer = {
              id: authData.user.id,
              auth_id: authData.user.id,
              email: data.email,
              phone: data.phone,
              full_name: data.full_name,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            updateCustomerState(fallback);
            return {};
          }
        } catch (e: unknown) {
          return { error: (e as Error).message };
        }
      }

      // Mock signup for local testing
      const mockCustomer: Customer = {
        id: crypto.randomUUID(),
        email: data.email,
        phone: data.phone,
        full_name: data.full_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      updateCustomerState(mockCustomer);
      return {};
    },
    [isSupabaseConfigured, updateCustomerState]
  );

  const logout = useCallback(async () => {
    if (isSupabaseConfigured) {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // Ignore
      }
    }
    updateCustomerState(null);
  }, [isSupabaseConfigured, updateCustomerState]);

  const resetPassword = useCallback(
    async (email: string): Promise<{ error?: string }> => {
      if (isSupabaseConfigured) {
        try {
          const supabase = createClient();
          const { error } = await supabase.auth.resetPasswordForEmail(email);
          if (error) return { error: error.message };
          return {};
        } catch (e: unknown) {
          return { error: (e as Error).message };
        }
      }
      return {};
    },
    [isSupabaseConfigured]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        signup,
        logout,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
