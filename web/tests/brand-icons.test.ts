import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Client review 2026-10-20 (#16): "Replace generic emojis with professional branded icons where
// appropriate." Every screen a customer or visitor sees uses line icons (components/ui/Icon);
// staff-only tools (Mission Control, intake, the driver app, the B2B portal) are not covered.
// ---------------------------------------------------------------------------
const SRC = join(__dirname, '..', 'src');
const STAFF_ONLY = /^(app\/(mission-control|staff|driver|portal|admin)\/|components\/(mission-control|driver)\/)/;
// Pictographs and symbols drawn as emoji; plain text marks (✓ → •) and flags are allowed
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;
const TEXT_MARKS = /[✓✔→•]/gu;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : name.endsWith('.tsx') ? [path] : [];
  });

describe('Line icons instead of emojis on customer screens', () => {
  it('no emoji in pages and components customers see', () => {
    const offenders = files(SRC)
      .map((f) => relative(SRC, f).replace(/\\/g, '/'))
      .filter((f) => !STAFF_ONLY.test(f))
      .flatMap((f) =>
        readFileSync(join(SRC, f), 'utf8')
          .split('\n')
          .map((line, i) => ({ line: line.replace(TEXT_MARKS, ''), i }))
          .filter(({ line }) => EMOJI.test(line))
          .map(({ line, i }) => `${f}:${i + 1}: ${line.trim().slice(0, 80)}`)
      );
    expect(offenders).toEqual([]);
  });

  it('the shared Icon hides itself from screen readers unless it stands alone', () => {
    const icon = readFileSync(join(SRC, 'components/ui/Icon/Icon.tsx'), 'utf8');
    expect(icon).toContain("{ role: 'img', 'aria-label': label } : { 'aria-hidden': true }");
  });
});
