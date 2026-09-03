import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import type { Customer, UserRole } from '@/types';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AuthCustomerResult {
  user: User | null;
  customer: Customer | null;
  error?: string;
}

export interface ApiAuthVerificationResult {
  errorResponse?: NextResponse;
  customer: Customer | null;
  user: User | null;
}

/**
 * Centralized backend authentication and customer resolution helper.
 * Uses the cookie-based server client to resolve the authenticated Supabase user,
 * and fetches the corresponding customer record with only required columns.
 * Eliminates redundant database roundtrips and inconsistent lookups across API routes.
 */
export async function getAuthenticatedCustomer(request?: Request): Promise<AuthCustomerResult> {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (!isSupabaseConfigured) {
    return { user: null, customer: null };
  }

  try {
    let user: User | null = null;

    // 1. Prioritize Bearer token from request Authorization header if present
    if (request) {
      const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '').trim();
        const adminClient = createAdminClient();
        const { data: tokenData, error: tokenErr } = await adminClient.auth.getUser(token);
        if (!tokenErr && tokenData?.user) {
          user = tokenData.user;
        }
      }
    }

    // 2. Fall back to cookie-based session
    if (!user) {
      const authClient = await createClient();
      const {
        data: { user: cookieUser },
        error: authError,
      } = await authClient.auth.getUser();

      if (!authError && cookieUser) {
        user = cookieUser;
      }
    }

    if (!user) {
      return { user: null, customer: null };
    }

    const supabase = createAdminClient();

    // Fetch customer record with specific required columns to minimize egress
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, auth_id, email, phone, full_name, role, created_at, updated_at')
      .or(`auth_id.eq.${user.id},email.eq.${user.email}`)
      .maybeSingle();

    if (customerError) {
      console.error('Customer lookup error in auth helper:', customerError);
      return { user, customer: null, error: customerError.message };
    }

    return {
      user,
      customer: (customer as Customer) || null,
    };
  } catch (err) {
    console.error('getAuthenticatedCustomer exception:', err);
    return { user: null, customer: null, error: (err as Error).message };
  }
}

/**
 * Enforces authentication and authorized role membership on backend API handlers.
 * Returns { errorResponse } if unauthorized/forbidden, or { customer, user } if authorized.
 */
export async function verifyApiAuth(
  allowedRoles?: UserRole[],
  request?: Request
): Promise<ApiAuthVerificationResult> {
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  // If Supabase is unconfigured in local development, provide mock admin access for UI testing
  if (!isSupabaseConfigured) {
    if (process.env.NODE_ENV === 'production') {
      return {
        customer: null,
        user: null,
        errorResponse: NextResponse.json(
          { error: 'Server configuration error: Database connection is not configured.' },
          { status: 500 }
        ),
      };
    }

    const mockCustomer: Customer = {
      id: 'c0000000-0000-0000-0000-000000000001',
      email: 'admin@firstelevencleaners.com',
      phone: '(214) 555-0199',
      full_name: 'Operations Admin',
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return { customer: mockCustomer, user: null };
  }

  const { customer, user } = await getAuthenticatedCustomer(request);

  if (!user || !customer) {
    return {
      customer: null,
      user: null,
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      ),
    };
  }

  const email = (user.email || customer.email || '').toLowerCase().trim();
  const metaRole = user.user_metadata?.role as UserRole | undefined;

  let userRole: UserRole = 'customer';

  // Multi-tier role resolution
  if (email === 'admin@firstelevencleaners.com' || email === 'admin@firsteleven.com') {
    userRole = 'admin';
  } else if (email === 'driver@firstelevencleaners.com' || email === 'driver@firsteleven.com') {
    userRole = 'driver';
  } else if (email === 'intake@firstelevencleaners.com' || email === 'intake@firsteleven.com') {
    userRole = 'intake_staff';
  } else if (metaRole && ['admin', 'driver', 'intake_staff', 'customer'].includes(metaRole)) {
    userRole = metaRole;
  } else if (customer.role && ['admin', 'driver', 'intake_staff', 'customer'].includes(customer.role)) {
    userRole = customer.role;
  } else if (customer.role === 'staff') {
    userRole = metaRole || (email.includes('intake') ? 'intake_staff' : 'driver');
  }

  // Construct full set of effective roles for permission checks
  const effectiveRoles = new Set<string>([userRole]);
  if (userRole === 'admin') {
    effectiveRoles.add('admin');
    effectiveRoles.add('intake_staff');
    effectiveRoles.add('driver');
  }
  if (userRole === 'intake_staff' || email.includes('intake')) {
    effectiveRoles.add('intake_staff');
  }
  if (userRole === 'driver' || email.includes('driver')) {
    effectiveRoles.add('driver');
  }
  if (customer.role === 'staff') {
    if (metaRole) effectiveRoles.add(metaRole);
    if (email.includes('intake')) effectiveRoles.add('intake_staff');
    if (email.includes('driver')) effectiveRoles.add('driver');
  }

  // Core administrative and intake staff are always permitted on staff routes
  if (email === 'intake@firstelevencleaners.com' || email === 'admin@firstelevencleaners.com') {
    return { customer: { ...customer, role: userRole }, user };
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const isPermitted = allowedRoles.some((r) => effectiveRoles.has(r));
    if (!isPermitted) {
      console.error('[verifyApiAuth 403 Forbidden]:', {
        email,
        userRole,
        customerRole: customer.role,
        metaRole,
        effectiveRoles: Array.from(effectiveRoles),
        allowedRoles,
      });
      return {
        customer,
        user,
        errorResponse: NextResponse.json(
          {
            error: `Forbidden: Account role '${userRole}' is not permitted to access this resource.`,
            detectedEmail: email,
            detectedRole: userRole,
            effectiveRoles: Array.from(effectiveRoles),
          },
          { status: 403 }
        ),
      };
    }
  }

  return { customer: { ...customer, role: userRole }, user };
}
