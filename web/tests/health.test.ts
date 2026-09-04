import { describe, it, expect } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('Production Health Check Endpoint (/api/health)', () => {
  it('responds with healthy status and metadata', async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body).toHaveProperty('timestamp');
    expect(body).toHaveProperty('uptime_seconds');
    expect(body).toHaveProperty('environment');
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('database');
    expect(['connected', 'mock_mode']).toContain(body.database.status);
    expect(typeof body.response_time_ms).toBe('number');
  });
});
