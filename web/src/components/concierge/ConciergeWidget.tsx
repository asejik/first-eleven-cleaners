'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConcierge } from '@/hooks/useConcierge';
import { useAuth } from '@/hooks/useAuth';
import styles from './ConciergeWidget.module.css';

const QUICK_CHIPS = [
  '⚡ Book my usual order',
  '📦 Where is my active order?',
  '🧺 Check my saved preferences',
  '💵 How much for 20 lbs + 2 suits?',
  '🇪🇸 ¿Hablas español?',
];

export function ConciergeWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const { messages, sendMessage, resetChat, isLoading } = useConcierge();
  const { user } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isLoading) return;
    sendMessage(inputText.trim(), user?.id);
    setInputText('');
  };

  const handleChipClick = (chipText: string) => {
    sendMessage(chipText, user?.id);
  };

  return (
    <>
      {/* Floating Trigger */}
      {!isOpen && (
        <button
          type="button"
          className={styles.floatingTrigger}
          onClick={() => setIsOpen(true)}
          aria-label="Open Eleven AI Concierge"
        >
          <div className={styles.avatarBadge}>
            <Image
              src="/icon.png"
              alt="Eleven AI"
              width={34}
              height={34}
              style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover' }}
            />
            <span className={styles.onlinePulse} />
          </div>
          <div className={styles.triggerText}>
            <span className={styles.triggerTitle}>Ask Eleven</span>
            <span className={styles.triggerSub}>AI Concierge • Online</span>
          </div>
        </button>
      )}

      {/* Expandable Chat Drawer */}
      {isOpen && (
        <div className={styles.chatDrawer}>
          {/* Header */}
          <div className={styles.drawerHeader}>
            <div className={styles.headerBrand}>
              <Image
                src="/icon.png"
                alt="Eleven AI"
                width={36}
                height={36}
                style={{ width: '36px', height: '36px', borderRadius: '50%', border: '1px solid var(--color-gold)' }}
              />
              <div>
                <h2 className={styles.headerTitle}>Eleven Concierge</h2>
                <p className={styles.headerSub}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                  Match-Ready AI Assistant
                </p>
              </div>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={resetChat}
                title="Reset conversation"
              >
                🔄
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                onClick={() => setIsOpen(false)}
                title="Close drawer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className={styles.messagesArea}>
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={idx}
                  className={`${styles.messageBubble} ${isUser ? styles.userMsg : styles.assistantMsg}`}
                >
                  {isUser ? (
                    <div className={styles.msgText}>{msg.content}</div>
                  ) : (
                    <div className={styles.markdownBody}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {msg.action && (
                    <div className={styles.actionCard}>
                      <Link
                        href={msg.action.url || '/book'}
                        className={styles.actionButton}
                        onClick={() => setIsOpen(false)}
                      >
                        {msg.action.label}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div className={styles.typingIndicator}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompt Chips */}
          <div className={styles.quickChipsArea}>
            {QUICK_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                className={styles.chipBtn}
                onClick={() => handleChipClick(chip)}
                disabled={isLoading}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form className={styles.inputForm} onSubmit={handleSubmit}>
            <input
              type="text"
              className={styles.inputField}
              placeholder="Ask Eleven anything about your garments..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isLoading}
            />
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={!inputText.trim() || isLoading}
              title="Send message"
            >
              ➤
            </button>
          </form>
        </div>
      )}
    </>
  );
}
