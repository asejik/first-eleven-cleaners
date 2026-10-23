import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Mission Control's board looked broken (2026-10-23): it used --text-2xs, which was never
// defined, so the browser dropped the size and buttons and labels came out at full size.
// Every var(--name) without a fallback must be defined in a stylesheet or by next/font.
// ---------------------------------------------------------------------------
const srcDir = join(__dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(css|tsx?)$/.test(name) ? [path] : [];
  });
}

describe('Design tokens', () => {
  it('every CSS variable used is defined', () => {
    const all = files(srcDir);
    const defined = new Set<string>();
    for (const f of all) {
      const text = readFileSync(f, 'utf8');
      if (f.endsWith('.css')) for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]);
      // next/font variables (layout.tsx: variable: '--font-archivo')
      for (const m of text.matchAll(/variable:\s*'(--[\w-]+)'/g)) defined.add(m[1]);
    }
    const missing: string[] = [];
    for (const f of all) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        if (!defined.has(m[1])) missing.push(`${relative(srcDir, f)}: ${m[1]}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it('the small sizes the staff boards use are defined', () => {
    const tokens = readFileSync(join(srcDir, 'styles/tokens.css'), 'utf8');
    for (const name of ['--text-2xs', '--text-md', '--font-extrabold', '--transition-normal', '--color-surface', '--color-border']) {
      expect(tokens, name).toMatch(new RegExp(`${name}:`));
    }
  });
});
