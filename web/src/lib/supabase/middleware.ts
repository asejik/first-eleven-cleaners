import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { staffPageRoles } from '@/lib/staff-routes';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project')) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate JWT signature and refresh session cookies securely via Supabase Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Staff pages are checked here, on the server, before they load (client review 2026-10-20, #2):
  // signed out goes to sign in, a signed-in customer goes home.
  const allowedRoles = staffPageRoles(request.nextUrl.pathname);
  if (allowedRoles) {
    let destination: string | null = null;
    if (!user) {
      destination = '/login';
    } else {
      const { data: customer } = await supabase.from('customers').select('role').eq('auth_id', user.id).maybeSingle();
      if (!customer?.role || !allowedRoles.includes(customer.role)) destination = '/';
    }
    if (destination) {
      const redirect = NextResponse.redirect(new URL(destination, request.url));
      supabaseResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
  }

  return supabaseResponse;
}

