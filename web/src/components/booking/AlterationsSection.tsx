'use client';

import { useState } from 'react';
import { DRY_CLEAN_PRICES, catalogItems, catalogPriceLabel, catalogLineTotal } from '@/lib/constants';
import {
  INSTRUCTION_LABELS,
  MATCH_TEXT,
  PINNED_TEXT,
  ALTERATIONS_NOT_OFFERED,
  checkAlterationLine,
  draftToLine,
  type AlterationDraft,
} from '@/lib/alterations';
import { prepareImageForUpload } from '@/lib/image-upload';
import styles from '@/app/book/page.module.css';

/**
 * Alterations on booking step 2 (client 2026-10-06, Parts B-D). Each piece is its own line
 * with a required fit instruction; buttons are one line with a quantity.
 */
interface AlterationsSectionProps {
  lines: AlterationDraft[];
  onAdd: (garmentType: string) => void;
  onUpdate: (uid: string, patch: Partial<AlterationDraft>) => void;
  onRemove: (uid: string) => void;
}

/** Photos are sent with the booking, so keep them small (about 1.4 MB at most) */
const MAX_PHOTO_BYTES = 1_400_000;

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.readAsDataURL(file);
  });

const fieldStyle = { width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-gray-300)' };

export function AlterationsSection({ lines, onAdd, onUpdate, onRemove }: AlterationsSectionProps) {
  const [photoError, setPhotoError] = useState<Record<string, string>>({});

  const attachPhoto = async (uid: string, file: File | undefined) => {
    setPhotoError((prev) => ({ ...prev, [uid]: '' }));
    if (!file) return;
    try {
      const prepared = await prepareImageForUpload(file);
      if (!/^image\/(jpeg|png|webp)$/.test(prepared.type) || prepared.size > MAX_PHOTO_BYTES) {
        throw new Error('Please use a JPEG or PNG photo under about 1 MB.');
      }
      onUpdate(uid, { photo: await readAsDataUrl(prepared) });
    } catch (err) {
      setPhotoError((prev) => ({ ...prev, [uid]: (err as Error).message }));
    }
  };

  return (
    <div>
      <div className={styles.sectionHeader} style={{ marginTop: 'var(--space-6)' }}>
        <h2><span aria-hidden="true">🧵</span> Alterations</h2>
        <span className={styles.subtext}>3–5 business days · not with Express</span>
      </div>
      <p className={styles.estimatorHint}>
        Tell us how for each piece: a measurement, a garment to match (tag it MATCH in the same bag), or pins.
        &quot;From&quot; prices are confirmed after our intake photos. {ALTERATIONS_NOT_OFFERED}
      </p>

      <div className={styles.garmentGrid}>
        {catalogItems('alteration').map(([key, item]) => (
          <div key={key} className={styles.garmentItem}>
            <div>
              <p className={styles.garmentName}>{item.label}</p>
              <span className={styles.garmentPrice}>{catalogPriceLabel(item)}</span>
              {item.note && <span className={styles.garmentNote}>{item.note}</span>}
            </div>
            <button
              type="button"
              className={styles.qtyBtn}
              onClick={() => onAdd(key)}
              aria-label={`Add ${item.label}`}
              disabled={Boolean(item.setWithQuantity) && lines.some((l) => l.garment_type === key)}
            >
              +
            </button>
          </div>
        ))}
      </div>

      {lines.map((line, index) => {
        const item = DRY_CLEAN_PRICES[line.garment_type];
        if (!item) return null;
        const check = checkAlterationLine(draftToLine(line));
        const groupId = `alt_${line.uid}`;
        return (
          <fieldset
            key={line.uid}
            style={{ border: '1px solid var(--color-gray-300)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)', marginTop: 'var(--space-4)' }}
          >
            <legend style={{ fontWeight: 700, padding: '0 6px' }}>
              {index + 1}. {item.label} · {item.fromPrice ? 'from ' : ''}${catalogLineTotal(line.garment_type, line.quantity).toFixed(2)}
            </legend>

            {item.setWithQuantity && (
              <label style={{ display: 'block', marginBottom: 'var(--space-3)' }}>
                How many buttons?
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={line.quantity}
                  onChange={(e) => onUpdate(line.uid, { quantity: Math.max(1, Math.min(50, Math.floor(Number(e.target.value) || 1))) })}
                  style={{ ...fieldStyle, width: '90px', marginLeft: '8px' }}
                />
              </label>
            )}

            {(item.instructions || []).length > 1 && (
              <div role="radiogroup" aria-label={`How should we alter ${item.label}?`} style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
                {(item.instructions || []).map((type) => (
                  <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="radio"
                      name={groupId}
                      checked={line.type === type}
                      onChange={() => onUpdate(line.uid, { type })}
                    />
                    {INSTRUCTION_LABELS[type]}
                  </label>
                ))}
              </div>
            )}

            {line.type === 'measurement' && (
              <label style={{ display: 'block' }}>
                Finished length
                <span style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    step="0.25"
                    value={line.value}
                    onChange={(e) => onUpdate(line.uid, { value: e.target.value })}
                    placeholder="31"
                    style={{ ...fieldStyle, width: '110px' }}
                  />
                  <select
                    value={line.unit}
                    onChange={(e) => onUpdate(line.uid, { unit: e.target.value as 'in' | 'cm' })}
                    aria-label="Unit"
                    style={{ ...fieldStyle, width: '90px' }}
                  >
                    <option value="in">inches</option>
                    <option value="cm">cm</option>
                  </select>
                </span>
              </label>
            )}
            {line.type === 'match' && <p style={{ margin: 0 }}>{MATCH_TEXT}</p>}
            {line.type === 'pinned' && <p style={{ margin: 0 }}>{PINNED_TEXT}</p>}
            {(line.type === 'amount' || line.type === 'description') && (
              <label style={{ display: 'block' }}>
                {line.type === 'amount' ? 'How much? (for example "take in 1 inch")' : item.note || 'What do you need?'}
                <input
                  type="text"
                  value={line.text}
                  maxLength={300}
                  onChange={(e) => onUpdate(line.uid, { text: e.target.value })}
                  style={{ ...fieldStyle, marginTop: '4px' }}
                />
              </label>
            )}

            <label style={{ display: 'block', marginTop: 'var(--space-3)' }}>
              Notes (optional)
              <textarea
                value={line.notes}
                maxLength={300}
                rows={2}
                onChange={(e) => onUpdate(line.uid, { notes: e.target.value })}
                style={{ ...fieldStyle, marginTop: '4px' }}
              />
            </label>

            {item.photoAllowed && (
              <label style={{ display: 'block', marginTop: 'var(--space-3)' }}>
                Photo of the repair (optional, helps us quote)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => attachPhoto(line.uid, e.target.files?.[0])}
                  style={{ display: 'block', marginTop: '4px' }}
                />
                {line.photo && <span className={styles.garmentNote}>Photo attached.</span>}
                {photoError[line.uid] && (
                  <span role="alert" style={{ color: 'var(--color-error)', display: 'block' }}>
                    {photoError[line.uid]}
                  </span>
                )}
              </label>
            )}

            {!check.ok && (
              <p role="status" style={{ color: 'var(--color-gold-text)', margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xs)' }}>
                {check.error}
              </p>
            )}
            <button
              type="button"
              onClick={() => onRemove(line.uid)}
              style={{ marginTop: 'var(--space-3)', background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: 0 }}
            >
              Remove
            </button>
          </fieldset>
        );
      })}
    </div>
  );
}
