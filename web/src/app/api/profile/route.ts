import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedCustomer } from '@/lib/supabase/auth-helpers';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limiter';

const ProfileUpdateSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name must be at least 2 characters').max(100),
  phone: z.string().trim().min(7, 'Please enter a valid phone number').max(30),
  preferred_channel: z.enum(['sms', 'whatsapp', 'email']).optional().default('sms'),
  promo_opt_in: z.boolean().optional().default(true),
});

export async function GET(request: Request) {
  try {
    const { user, customer } = await getAuthenticatedCustomer(request);
    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({
      profile: {
        id: customer.id,
        email: customer.email,
        full_name: customer.full_name,
        phone: customer.phone || '',
        role: customer.role,
        preferred_channel: 'sms',
        promo_opt_in: true,
      },
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`profile_update:${clientIp}`, 15, 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many profile updates. Please wait a minute.' },
        { status: 429 }
      );
    }

    const { user, customer } = await getAuthenticatedCustomer(request);
    if (!user || !customer) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parseResult = ProfileUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return NextResponse.json(
        { error: issue?.message || 'Invalid profile information' },
        { status: 400 }
      );
    }

    const { full_name, phone, preferred_channel, promo_opt_in } = parseResult.data;

    const isSupabaseConfigured =
      Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

    if (isSupabaseConfigured) {
      const supabase = createAdminClient();

      // Update customers table
      const { data: updatedCustomer, error: updateErr } = await supabase
        .from('customers')
        .update({
          full_name,
          phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', customer.id)
        .select('id, email, full_name, phone, role')
        .single();

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }

      // Keep Supabase auth user metadata in sync
      if (customer.auth_id) {
        await supabase.auth.admin.updateUserById(customer.auth_id, {
          user_metadata: { full_name },
        });
      }

      return NextResponse.json({
        success: true,
        profile: {
          ...updatedCustomer,
          preferred_channel,
          promo_opt_in,
        },
        message: 'Profile updated successfully.',
      });
    }

    // Mock mode response
    return NextResponse.json({
      success: true,
      profile: {
        id: customer.id,
        email: customer.email,
        full_name,
        phone,
        role: customer.role,
        preferred_channel,
        promo_opt_in,
      },
      message: 'Profile updated successfully.',
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
