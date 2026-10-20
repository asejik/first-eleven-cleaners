import type { LucideIcon } from 'lucide-react';
import styles from './Icon.module.css';

/**
 * A line icon in place of an emoji (client review 2026-10-20, #16: "Replace generic emojis with
 * professional branded icons"). Sized to the text by default and hidden from screen readers,
 * since the words next to it say the same thing; pass `label` when the icon stands alone.
 */
export function Icon({ icon: Glyph, size = '1em', className, label, strokeWidth = 1.8 }: { icon: LucideIcon; size?: number | string; className?: string; label?: string; strokeWidth?: number }) {
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className ? `${styles.icon} ${className}` : styles.icon}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    />
  );
}
