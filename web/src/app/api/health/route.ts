import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const startTime = Date.now();

  const isSupabaseConfigured =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('your-project');

  let dbStatus: 'connected' | 'mock_mode' | 'unhealthy' = 'mock_mode';
  let dbLatencyMs = 0;

  if (isSupabaseConfigured) {
    try {
      const dbStart = Date.now();
      const supabase = createAdminClient();
      const { error } = await supabase.from('zones').select('id', { count: 'exact', head: true });
      dbLatencyMs = Date.now() - dbStart;

      if (error) {
        console.error('Health check DB error:', error);
        dbStatus = 'unhealthy';
      } else {
        dbStatus = 'connected';
      }
    } catch (err) {
      console.error('Health check DB exception:', err);
      dbStatus = 'unhealthy';
    }
  }

  const isHealthy = dbStatus !== 'unhealthy';
  const statusCode = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || 'development',
      version: '0.1.0',
      database: {
        status: dbStatus,
        latency_ms: dbLatencyMs,
      },
      response_time_ms: Date.now() - startTime,
    },
    { status: statusCode }
  );
}
