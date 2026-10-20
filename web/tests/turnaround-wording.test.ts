import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#9, agreed): the plant runs Monday to Friday, so a Thursday pickup
// comes back Monday and "48 hours" wasn't always true. Customers are promised 2 business days.
// Staff-side timers (the 48-hour payment and quote call reminders) are not promises and stay.
// ---------------------------------------------------------------------------
const SRC = join(__dirname, '..', 'src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

// "48-hour turnaround", "48-Hr Standard", "within 48 hours", "48h" as a customer promise
const PROMISE = /48[- ]?(hour|hr)s?\b|within 48 hours|>48h</i;
// Lines about staff timers, not promises to customers
const STAFF_TIMER = /staff|reminder|hold|expir|has needed|has waited/i;
const COMMENT = /^\s*(\/\/|\*)/;

describe('The turnaround promise is 2 business days', () => {
  it('no customer-facing page, message or prompt promises 48 hours', () => {
    const offenders = files(SRC)
      // constants.ts is off limits without approval; its STANDARD_BADGE isn't shown anywhere
      .filter((f) => !f.endsWith('constants.ts'))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ where: `${f.slice(SRC.length + 1)}:${i + 1}`, line }))
          .filter(({ line }) => PROMISE.test(line) && !STAFF_TIMER.test(line) && !COMMENT.test(line)),
      )
      .map(({ where }) => where);
    expect(offenders).toEqual([]);
  });

  it('Terms explain the plant days instead of "excluding Sundays"', () => {
    const terms = readFileSync(join(SRC, 'app/terms/page.tsx'), 'utf8');
    expect(terms).toContain('Standard orders are delivered 2 business days after pickup under our Match-Ready Guarantee.');
    expect(terms).toContain('a Thursday pickup is delivered Monday');
    expect(terms).not.toContain('excluding Sundays');
  });
});
