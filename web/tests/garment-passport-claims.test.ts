import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client 2026-10-20 (#4): "we don't barcode. Remove it. What's true is every garment is
// photographed and tracked by order number in the Garment Passport, so say that instead."
// ---------------------------------------------------------------------------
const SRC = join(__dirname, '..', 'src');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

describe('Garment tracking claims', () => {
  it('no barcodes, RFID or garment tags are claimed anywhere', () => {
    const offenders = files(SRC).filter((f) => /barcod|bar code|RFID|tagged, and tracked|intake tags/i.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('the homepage and Terms say what is true', () => {
    expect(read('app/page.tsx')).toContain('Every garment photographed and tracked by order number in your Garment Passport.');
    expect(read('app/terms/page.tsx')).toContain(
      'Every garment is photographed at intake and tracked by order number in your digital Garment Passport.',
    );
  });
});
