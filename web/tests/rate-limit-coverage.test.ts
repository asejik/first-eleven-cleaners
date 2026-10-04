import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function routeFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name === 'route.ts' ? [full] : [];
  });
}

describe('API routes use the shared rate limiter (SEC-13)', () => {
  it('no route uses the per-instance in-memory limiter directly', () => {
    const apiDir = path.resolve(__dirname, '../src/app/api');
    const offenders = routeFiles(apiDir).filter((file) => /\bcheckRateLimit\(/.test(fs.readFileSync(file, 'utf8')));
    expect(offenders.map((f) => path.relative(apiDir, f))).toEqual([]);
  });
});
