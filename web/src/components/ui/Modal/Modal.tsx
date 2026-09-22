'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './Modal.module.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  // Always keep latest onClose callback in ref without re-triggering effects
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!isOpen) return;

    // Save previous active element to restore focus upon dismissal
    previousActiveElement.current = document.activeElement as HTMLElement | null;

    // Lock background scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Auto-focus appropriate element inside modal ONCE upon opening
    const focusTimer = setTimeout(() => {
      if (!modalRef.current) return;

      // If user or browser already focused inside modal, do not steal focus
      if (modalRef.current.contains(document.activeElement)) {
        return;
      }

      // 1. Explicit autofocus element inside modal
      const autoFocusEl = modalRef.current.querySelector<HTMLElement>('[autofocus]');
      if (autoFocusEl && typeof autoFocusEl.focus === 'function') {
        autoFocusEl.focus();
        return;
      }

      // 2. First form input or interactive field in content
      if (contentRef.current) {
        const firstInput = contentRef.current.querySelector<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
        );
        if (firstInput && typeof firstInput.focus === 'function') {
          firstInput.focus();
          return;
        }

        // 3. First focusable element in content
        const contentFocusables = Array.from(
          contentRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.getClientRects().length > 0);

        if (contentFocusables.length > 0) {
          contentFocusables[0].focus();
          return;
        }
      }

      // 4. Fallback to any focusable in modal (e.g. close button) or modal container
      const focusables = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.getClientRects().length > 0);

      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        modalRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;

        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.getClientRects().length > 0);

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === firstElement ||
            !modalRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (
            document.activeElement === lastElement ||
            !modalRef.current.contains(document.activeElement)
          ) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(focusTimer);
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);

      // Restore focus to original triggering element
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`${styles.modal} ${styles[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          {title && <h3 id="modal-title" className={styles.title}>{title}</h3>}
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div ref={contentRef} className={styles.content}>{children}</div>

        {/* Footer */}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}
