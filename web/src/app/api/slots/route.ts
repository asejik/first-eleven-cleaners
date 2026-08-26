import { NextResponse } from 'next/server';
import { PICKUP_WINDOWS } from '@/lib/constants';

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

  // Return available morning and evening slots
  const slots = PICKUP_WINDOWS.map((window) => ({
    id: `${dateParam}-${window.id}`,
    date: dateParam,
    window: window.id,
    label: `${window.label} (${window.start} – ${window.end})`,
    capacity: 25,
    booked_count: Math.floor(Math.random() * 8), // simulated current load
    is_available: true,
  }));

  return NextResponse.json({
    date: dateParam,
    is_available: true,
    slots,
  });
}
