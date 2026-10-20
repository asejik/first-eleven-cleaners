import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#8): no internal financial metrics (the 32% labor-cost target) and
// no comparisons to Uber or Chewy; "Our brand, operational practices, and service guarantees
// should speak for themselves."
// ---------------------------------------------------------------------------
const SRC = join(__dirname, '..', 'src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

describe('No competitor comparisons or internal metrics in the site', () => {
  it('no page, component or library mentions Uber, Chewy or a labor-cost target', () => {
    const offenders = [join(SRC, 'app'), join(SRC, 'components'), join(SRC, 'lib')]
      .flatMap(files)
      .filter((file) => /Chewy|Uber|labor[- ]cost/i.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC.length + 1));
    expect(offenders).toEqual([]);
  });
});
