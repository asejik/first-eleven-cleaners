import { NextResponse } from 'next/server';
import { PICKUP_WINDOWS } from '@/lib/constants';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get('date');

  if (!dateParam) {
    return NextResponse.json({ error: 'date query parameter is required (YYYY-MM-DD)' }, { status: 400 });
  }

  const selectedDate = new Date(dateParam + 'T00:00:00');
  const dayOfWeek = selectedDate.getDay(); // 0 is Sunday

  // Sunday is dark
  if (dayOfWeek === 0) {
    return NextResponse.json({
      date: dateParam,
      is_available: false,
      reason: 'Our processing hub is closed on Sundays for weekly maintenance.',
      slots: [],
    });
  }

  // Query actual booked counts from orders table for this date
  const bookedMap: Record<string, number> = { morning: 0, evening: 0 };
  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  if (isSupabaseConfigured) {
    try {
      const supabase = createAdminClient();
      const [{ count: morningCount }, { count: eveningCount }] = await Promise.all([
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('pickup_date', dateParam)
          .eq('pickup_window', 'morning')
          .neq('status', 'cancelled'),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('pickup_date', dateParam)
          .eq('pickup_window', 'evening')
          .neq('status', 'cancelled'),
      ]);

      bookedMap.morning = morningCount ?? 0;
      bookedMap.evening = eveningCount ?? 0;
    } catch {
      // Fallback cleanly to 0 if database read fails
    }
  }

  // Return available morning and evening slots
  const slots = PICKUP_WINDOWS.map((window) => {
    const booked = bookedMap[window.id] ?? 0;
    const capacity = 25;
    const isAvailable = booked < capacity;

    return {
      id: `${dateParam}-${window.id}`,
      date: dateParam,
      window: window.id,
      label: `${window.label} (${window.start} – ${window.end})`,
      capacity,
      booked_count: booked,
      is_available: isAvailable,
    };
  });

  return NextResponse.json({
    date: dateParam,
    is_available: slots.some((s) => s.is_available),
    slots,
  });
}
